import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setSession, verifyPin } from "@/lib/session";
import { allowRequest, clientIp } from "@/lib/ratelimit";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });

  const { email, pin } = body;
  if (typeof email !== "string" || !email.trim() || typeof pin !== "string") {
    return NextResponse.json({ error: "이메일과 PIN을 입력해 주세요." }, { status: 400 });
  }

  // PIN 무차별 대입 방지: IP당 분당 10회
  if (!allowRequest(`login:${clientIp(req)}`, 10, 60_000)) {
    return NextResponse.json(
      { error: "시도가 너무 많아요. 잠시 후 다시 시도해 주세요." },
      { status: 429 }
    );
  }

  const d = await db();
  const user = await d.getUserByEmail(email.trim().toLowerCase());
  if (!user || !verifyPin(pin, user.pin_hash)) {
    return NextResponse.json({ error: "이메일 또는 PIN이 일치하지 않아요." }, { status: 401 });
  }

  await setSession({ userId: user.id });
  return NextResponse.json({ ok: true });
}
