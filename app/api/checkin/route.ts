import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import sharp from "sharp";
import { db } from "@/lib/db";
import { getAuthed } from "@/lib/auth";
import { kstParts, judgeLate, fmtTimeKST } from "@/lib/time";
import { purgeOldPhotosOnce } from "@/lib/retention";
import { sendPushToUsers } from "@/lib/push";

export const runtime = "nodejs";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8MB

// 사진 한 장으로 여러 그룹 동시 출근 인증
// FormData: photo(파일), groups(그룹 ID 배열 JSON — 생략 시 현재 그룹)
export async function POST(req: NextRequest) {
  const auth = await getAuthed();
  if (!auth) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  if (auth.memberships.length === 0) {
    return NextResponse.json({ error: "참여 중인 그룹이 없어요." }, { status: 400 });
  }

  const form = await req.formData().catch(() => null);
  const photo = form?.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return NextResponse.json({ error: "인증 사진이 필요해요. 📸" }, { status: 400 });
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: "사진이 너무 커요 (8MB 이하)." }, { status: 400 });
  }
  if (!photo.type.startsWith("image/")) {
    return NextResponse.json({ error: "이미지 파일만 올릴 수 있어요." }, { status: 400 });
  }

  // 대상 그룹: groups 필드(JSON 배열) 또는 현재 그룹
  let groupIds: string[];
  try {
    const raw = form?.get("groups");
    groupIds = typeof raw === "string" ? JSON.parse(raw) : [];
  } catch {
    groupIds = [];
  }
  if (!Array.isArray(groupIds) || groupIds.length === 0) {
    groupIds = auth.current ? [auth.current.group.id] : [];
  }
  const targets = auth.memberships.filter((m) => groupIds.includes(m.group.id));
  if (targets.length === 0) {
    return NextResponse.json({ error: "인증할 그룹을 선택해 주세요." }, { status: 400 });
  }

  // ⭐ 핵심: 촬영 기기 시각이 아닌 서버 수신 시각으로 기록 (조작 방지)
  const now = new Date();
  const kst = kstParts(now);
  const d = await db();

  // 서버에서 압축·리사이즈 (기본 카메라 앱의 수 MB 사진도 ~100-250KB로 저장)
  // rotate(): EXIF 회전 반영 후 메타데이터(GPS 등)는 제거됨
  let buf: Buffer;
  try {
    buf = await sharp(Buffer.from(await photo.arrayBuffer()))
      .rotate()
      .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 78 })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "이미지를 처리할 수 없어요." }, { status: 400 });
  }

  // 사진은 계정 단위로 한 번만 저장, 여러 그룹의 체크인이 공유
  const path = `u/${auth.user.id}/${kst.date}/${now.getTime()}.jpg`;
  try {
    await d.uploadPhoto(path, buf, "image/jpeg");
  } catch {
    return NextResponse.json({ error: "사진 업로드에 실패했어요." }, { status: 500 });
  }

  const results: { groupId: string; groupName: string; ok: boolean; error?: string; isLate?: boolean; lateMinutes?: number }[] = [];
  for (const { member, group } of targets) {
    try {
      const override = await d.getOverride(member.id, kst.date);
      const effectiveTime = override?.scheduled_time ?? member.scheduled_time;
      const { isLate, lateMinutes } = judgeLate(now, effectiveTime);
      await d.createCheckin({
        member_id: member.id,
        work_date: kst.date,
        checked_at: now.toISOString(),
        photo_path: path,
        is_late: isLate,
        late_minutes: lateMinutes,
      });
      results.push({ groupId: group.id, groupName: group.name, ok: true, isLate, lateMinutes });
      // 보관 기간 지난 사진 지연 정리 (그룹당 하루 1회, 응답을 막지 않음)
      purgeOldPhotosOnce(d, group.id, kst.date).catch(() => {});
    } catch (e) {
      const already = e instanceof Error && e.message === "already_checked_in";
      results.push({
        groupId: group.id,
        groupName: group.name,
        ok: false,
        error: already ? "이미 출근 도장을 찍었어요" : "기록 저장 실패",
      });
    }
  }

  // 출석 알림 — 응답을 보낸 뒤 백그라운드로 발송 (알림이 인증을 늦추지 않게)
  const okGroups = targets.filter(({ group }) =>
    results.some((r) => r.groupId === group.id && r.ok)
  );
  if (okGroups.length > 0) {
    const username = auth.user.username;
    const time = fmtTimeKST(now.toISOString()).slice(0, 5);
    after(async () => {
      for (const { group } of okGroups) {
        try {
          const watchers = (await d.listMembers(group.id)).filter(
            (m) => m.notify_checkin && m.user_id !== auth.user.id
          );
          await sendPushToUsers(
            d,
            [...new Set(watchers.map((m) => m.user_id))],
            {
              title: group.name,
              body: `🥳 ${username}님이 출근 도장을 쿵! 찍었어요 (${time})`,
              url: "/today",
              tag: `checkin-${group.id}`,
            }
          );
        } catch (e) {
          console.error("[push] 출석 알림 실패:", e instanceof Error ? e.message : e);
        }
      }
    });
  }

  const anyOk = results.some((r) => r.ok);
  return NextResponse.json(
    { ok: anyOk, time: kst.hhmmss, results },
    { status: anyOk ? 200 : 409 }
  );
}
