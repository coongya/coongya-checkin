import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { kstParts, isWorkday, minutesFromHHMM } from "@/lib/time";
import { sendPushToUsers, pushConfigured } from "@/lib/push";
import { parseReminders } from "@/lib/types";

export const dynamic = "force-dynamic";

// 출근 리마인더 크론 — 매 분 호출 (Supabase pg_cron 등 외부 스케줄러).
// "리마인더를 켠 멤버 중, 오늘 근무일이고 아직 인증 전이며,
//  기준 시각까지 정확히 N분 남은" 대상에게 푸시를 보낸다.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const got =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    req.nextUrl.searchParams.get("secret") ??
    "";
  if (!secret || got !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!pushConfigured()) return NextResponse.json({ ok: true, sent: 0, reason: "no-vapid" });

  const kst = kstParts();
  const today = kst.date;
  const nowMin = kst.minutesOfDay;

  const d = await db();
  const all = await d.listRemindableMemberships();
  // 오늘 판정 대상만 추리기 — 그룹 시작 전/휴무일 제외
  const candidates = all.filter(
    ({ member, group }) => today >= group.start_date && isWorkday(today, member.workdays)
  );
  if (candidates.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const ids = candidates.map(({ member }) => member.id);
  const [checkins, absences, overrides] = await Promise.all([
    d.listCheckins(ids, today, today),
    d.listAbsences(ids, today, today),
    d.listOverrides(ids, today, today),
  ]);
  const checked = new Set(checkins.map((c) => c.member_id));
  const excused = new Set(absences.map((a) => a.member_id));

  let sent = 0;
  for (const { member, group } of candidates) {
    if (checked.has(member.id) || excused.has(member.id)) continue;
    const effective =
      overrides.find((o) => o.member_id === member.id)?.scheduled_time ??
      member.scheduled_time;
    const schedMin = minutesFromHHMM(effective);
    for (const offset of parseReminders(member.reminders)) {
      if (schedMin - offset !== nowMin) continue;
      // 크론 재시도/중복 실행 대비 — (멤버, 날짜, N분 전)당 1회만
      const fresh = await d.tryLogReminder(member.id, today, offset);
      if (!fresh) continue;
      sent += await sendPushToUsers(d, [member.user_id], {
        title: group.name,
        body: `⏰ 출근 인증까지 ${offset}분 남았어요! (기준 ${effective})`,
        url: "/dashboard",
        tag: `reminder-${group.id}-${today}`,
      });
    }
  }
  return NextResponse.json({ ok: true, sent });
}
