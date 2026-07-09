import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthed } from "@/lib/auth";
import { kstParts, judgeLate, isWorkday } from "@/lib/time";

export const runtime = "nodejs";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8MB

export async function POST(req: NextRequest) {
  const auth = await getAuthed();
  if (!auth) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { member } = auth;

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

  // ⭐ 핵심: 촬영 기기 시각이 아닌 서버 수신 시각으로 기록 (조작 방지)
  const now = new Date();
  const kst = kstParts(now);

  const d = await db();
  const existing = await d.getCheckin(member.id, kst.date);
  if (existing) {
    return NextResponse.json({ error: "오늘은 이미 출근 도장을 찍었어요! 🎉" }, { status: 409 });
  }

  const ext = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
  const path = `${member.group_id}/${kst.date}/${member.id}-${now.getTime()}.${ext}`;
  const buf = Buffer.from(await photo.arrayBuffer());
  try {
    await d.uploadPhoto(path, buf, photo.type);
  } catch {
    return NextResponse.json({ error: "사진 업로드에 실패했어요." }, { status: 500 });
  }

  // 해당 일자에 기준 시각 변경이 있으면 그 시각으로 판정
  const override = await d.getOverride(member.id, kst.date);
  const effectiveTime = override?.scheduled_time ?? member.scheduled_time;
  const { isLate, lateMinutes } = judgeLate(now, effectiveTime);

  try {
    const checkin = await d.createCheckin({
      member_id: member.id,
      work_date: kst.date,
      checked_at: now.toISOString(),
      photo_path: path,
      is_late: isLate,
      late_minutes: lateMinutes,
    });
    return NextResponse.json({
      ok: true,
      checkin,
      workday: isWorkday(kst.date, member.workdays),
      time: kst.hhmmss,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "already_checked_in") {
      return NextResponse.json({ error: "오늘은 이미 출근 도장을 찍었어요! 🎉" }, { status: 409 });
    }
    return NextResponse.json({ error: "기록 저장에 실패했어요." }, { status: 500 });
  }
}
