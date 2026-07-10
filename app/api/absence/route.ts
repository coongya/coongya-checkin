import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthed } from "@/lib/auth";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// 재택은 집에서도 출근 인증이 가능하므로 휴가 사유에서 제외
const REASONS = ["휴가", "교육", "아파요", "출장"];

// 현재 그룹에 휴가/미출근 사유 등록
export async function POST(req: NextRequest) {
  const auth = await getAuthed();
  if (!auth?.current) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const member = auth.current.member;

  const body = await req.json().catch(() => null);
  const date = body?.date;
  const reason = REASONS.includes(body?.reason) ? body.reason : "휴가";
  if (typeof date !== "string" || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "날짜가 올바르지 않아요." }, { status: 400 });
  }

  const d = await db();
  const checkin = await d.getCheckin(member.id, date);
  if (checkin) {
    return NextResponse.json(
      { error: "이미 출근 기록이 있는 날짜예요." },
      { status: 409 }
    );
  }
  try {
    const absence = await d.createAbsence(member.id, date, reason);
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
  if (!auth?.current) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const date = body?.date;
  if (typeof date !== "string" || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "날짜가 올바르지 않아요." }, { status: 400 });
  }
  const d = await db();
  await d.deleteAbsence(auth.current.member.id, date);
  return NextResponse.json({ ok: true });
}
