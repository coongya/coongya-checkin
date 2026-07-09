import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setSession, hashPin } from "@/lib/session";
import { isValidPin, isValidEmail, validateUsername } from "@/lib/auth";
import { allowRequest, clientIp } from "@/lib/ratelimit";
import { AVATAR_INFO } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });

  const { username, email, pin, pinConfirm, avatar } = body;
  const checked = validateUsername(username);
  if ("error" in checked) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "이메일 주소를 확인해 주세요." }, { status: 400 });
  }
  if (!isValidPin(pin)) {
    return NextResponse.json({ error: "PIN은 숫자 4~6자리로 입력해 주세요." }, { status: 400 });
  }
  if (pin !== pinConfirm) {
    return NextResponse.json({ error: "PIN과 PIN 확인이 일치하지 않아요." }, { status: 400 });
  }
  if (!allowRequest(`signup:${clientIp(req)}`, 10, 60_000)) {
    return NextResponse.json(
      { error: "시도가 너무 많아요. 잠시 후 다시 시도해 주세요." },
      { status: 429 }
    );
  }

  const d = await db();
  try {
    const user = await d.createUser({
      username: checked.name,
      email: email.trim().toLowerCase(),
      pin_hash: hashPin(pin),
      avatar: typeof avatar === "string" && avatar in AVATAR_INFO ? avatar : "onion",
    });
    await setSession({ userId: user.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "duplicate_email") {
      return NextResponse.json(
        { error: "이미 가입된 이메일이에요. 로그인해 주세요." },
        { status: 409 }
      );
    }
    // Vercel 로그(Observability)에서 실패 원인을 볼 수 있도록 남긴다
    console.error("[signup] 가입 실패:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "가입에 실패했어요." }, { status: 500 });
  }
}
