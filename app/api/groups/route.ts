import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setCurrentGroupId } from "@/lib/session";
import { getAuthed, generateInviteCode, isValidHHMM, isValidStartDate } from "@/lib/auth";
import { kstParts } from "@/lib/time";

// 그룹 만들기 (로그인 필요) — 만든 사람이 관리자
export async function POST(req: NextRequest) {
  const auth = await getAuthed();
  if (!auth) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });

  const { groupName, scheduledTime, startDate } = body;
  if (!groupName?.trim() || groupName.trim().length > 30) {
    return NextResponse.json({ error: "그룹 이름을 확인해 주세요 (30자 이하)." }, { status: 400 });
  }
  if (!isValidHHMM(scheduledTime)) {
    return NextResponse.json({ error: "기준 출근 시각이 올바르지 않아요." }, { status: 400 });
  }
  const today = kstParts().date;
  // 시작일 생략 시 오늘(KST)부터 — 이 날짜 전에는 기록·벌금 판정을 하지 않는다
  const start = startDate === undefined || startDate === "" ? today : startDate;
  if (!isValidStartDate(start, today)) {
    return NextResponse.json(
      { error: "시작일이 올바르지 않아요 (오늘 기준 1년 이내)." },
      { status: 400 }
    );
  }

  const d = await db();
  // 초대코드 충돌 시 재시도
  let group = null;
  for (let i = 0; i < 5 && !group; i++) {
    try {
      group = await d.createGroup({
        name: groupName.trim(),
        invite_code: generateInviteCode(),
        fine_late: 10000,
        fine_absent: 10000,
        start_date: start,
      });
    } catch (e) {
      console.error("[groups] 그룹 생성 실패:", e instanceof Error ? e.message : e);
      group = null;
    }
  }
  if (!group) return NextResponse.json({ error: "그룹 생성에 실패했어요." }, { status: 500 });

  // 벌금 이력 시드 — 시작일부터 기본 금액 적용 (이후 금액을 바꿔도 과거는 유지)
  await d.upsertFineRule(group.id, start, group.fine_late, group.fine_absent);

  await d.createMembership({
    user_id: auth.user.id,
    group_id: group.id,
    scheduled_time: scheduledTime,
    workdays: "12345",
    is_admin: true,
  });

  await setCurrentGroupId(group.id);
  return NextResponse.json({ ok: true, inviteCode: group.invite_code });
}
