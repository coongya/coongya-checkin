import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthed, isValidHHMM } from "@/lib/auth";
import { kstParts } from "@/lib/time";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 현재 그룹에서 특정 일자의 기준 출근 시각 변경 (오늘 포함 미래만, 이미 인증한 날 불가)
export async function POST(req: NextRequest) {
  const auth = await getAuthed();
  if (!auth?.current) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const member = auth.current.member;

  const body = await req.json().catch(() => null);
  const date = body?.date;
  const time = body?.time;
  if (typeof date !== "string" || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "날짜가 올바르지 않아요." }, { status: 400 });
  }
  if (!isValidHHMM(time)) {
    return NextResponse.json({ error: "시각은 HH:MM 형식이에요." }, { status: 400 });
  }
  const today = kstParts().date;
  if (date < today) {
    return NextResponse.json(
      { error: "지난 날짜의 기준 시각은 바꿀 수 없어요." },
      { status: 400 }
    );
  }

  const d = await db();
  const checkin = await d.getCheckin(member.id, date);
  if (checkin) {
    return NextResponse.json(
      { error: "이미 출근 인증한 날짜는 바꿀 수 없어요." },
      { status: 409 }
    );
  }
  const override = await d.upsertOverride(member.id, date, time);
  return NextResponse.json({ ok: true, override });
}

export async function DELETE(req: NextRequest) {
  const auth = await getAuthed();
  if (!auth?.current) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const date = body?.date;
  if (typeof date !== "string" || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "날짜가 올바르지 않아요." }, { status: 400 });
  }
  const d = await db();
  const checkin = await d.getCheckin(auth.current.member.id, date);
  if (checkin) {
    return NextResponse.json(
      { error: "이미 출근 인증한 날짜는 되돌릴 수 없어요." },
      { status: 409 }
    );
  }
  await d.deleteOverride(auth.current.member.id, date);
  return NextResponse.json({ ok: true });
}
