import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthed } from "@/lib/auth";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  const auth = await getAuthed();
  if (!auth) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const date = body?.date;
  const REASONS = ["휴가", "재택", "교육", "아파요"];
  const reason = REASONS.includes(body?.reason) ? body.reason : "휴가";
  if (typeof date !== "string" || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "날짜가 올바르지 않아요." }, { status: 400 });
  }

  const d = await db();
  const checkin = await d.getCheckin(auth.member.id, date);
  if (checkin) {
    return NextResponse.json(
      { error: "이미 출근 기록이 있는 날짜예요." },
      { status: 409 }
    );
  }
  try {
    const absence = await d.createAbsence(auth.member.id, date, reason);
    return NextResponse.json({ ok: true, absence });
  } catch (e) {
    if (e instanceof Error && e.message === "already_exists") {
      return NextResponse.json({ error: "이미 등록된 날짜예요." }, { status: 409 });
    }
    return NextResponse.json({ error: "등록에 실패했어요." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await getAuthed();
  if (!auth) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const date = body?.date;
  if (typeof date !== "string" || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "날짜가 올바르지 않아요." }, { status: 400 });
  }
  const d = await db();
  await d.deleteAbsence(auth.member.id, date);
  return NextResponse.json({ ok: true });
}
