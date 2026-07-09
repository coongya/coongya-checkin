import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setSession, hashPin } from "@/lib/session";
import { isValidPin } from "@/lib/auth";
import { allowRequest, clientIp } from "@/lib/ratelimit";
import { AVATAR_INFO } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });

  const { username, pin, avatar } = body;
  if (!username?.trim()) {
    return NextResponse.json({ error: "닉네임을 입력해 주세요." }, { status: 400 });
  }
  if (username.trim().length > 20) {
    return NextResponse.json({ error: "닉네임은 20자 이하로 입력해 주세요." }, { status: 400 });
  }
  if (!isValidPin(pin)) {
    return NextResponse.json({ error: "PIN은 숫자 4~6자리로 입력해 주세요." }, { status: 400 });
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
      username: username.trim(),
      pin_hash: hashPin(pin),
      avatar: typeof avatar === "string" && avatar in AVATAR_INFO ? avatar : "onion",
    });
    await setSession({ userId: user.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "duplicate_username") {
      return NextResponse.json(
        { error: "이미 사용 중인 닉네임이에요. 다른 닉네임을 써 주세요." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "가입에 실패했어요." }, { status: 500 });
  }
}
