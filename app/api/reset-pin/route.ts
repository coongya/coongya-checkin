import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setSession, hashPin, verifyPin } from "@/lib/session";
import { isValidEmail, isValidPin } from "@/lib/auth";
import { allowRequest, clientIp } from "@/lib/ratelimit";

const MAX_ATTEMPTS = 5;

// PIN 재설정 — 그룹 관리자에게 받은 임시 코드로 새 PIN을 설정하고 로그인.
// 어떤 단계에서 틀렸는지 구분하지 않는 동일한 에러 메시지를 쓴다 (계정/코드 탐색 방지).
const GENERIC_ERROR = "임시 코드가 올바르지 않거나 만료됐어요.";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const { code, newPin, newPinConfirm } = body;
  if (!isValidEmail(email) || typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }
  if (!isValidPin(newPin)) {
    return NextResponse.json({ error: "새 PIN은 숫자 4~6자리예요." }, { status: 400 });
  }
  if (newPin !== newPinConfirm) {
    return NextResponse.json({ error: "PIN과 PIN 확인이 일치하지 않아요." }, { status: 400 });
  }

  // 코드 무차별 대입 방지: IP당 분당 10회 (+ 코드 자체도 5회 시도 제한)
  if (!allowRequest(`resetpin:${clientIp(req)}`, 10, 60_000)) {
    return NextResponse.json(
      { error: "시도가 너무 많아요. 잠시 후 다시 시도해 주세요." },
      { status: 429 }
    );
  }

  const d = await db();
  const user = await d.getUserByEmail(email);
  if (!user) return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });

  const reset = await d.getPinReset(user.id);
  if (!reset || reset.expires_at < new Date().toISOString()) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }
  if (reset.attempts >= MAX_ATTEMPTS) {
    await d.deletePinReset(user.id);
    return NextResponse.json(
      { error: "시도 횟수를 초과했어요. 관리자에게 코드를 다시 요청해 주세요." },
      { status: 429 }
    );
  }
  if (!verifyPin(code, reset.code_hash)) {
    await d.incrementPinResetAttempts(user.id);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  // 인증 성공 — 코드는 1회용이므로 즉시 폐기하고 새 PIN 저장 후 로그인
  await d.deletePinReset(user.id);
  await d.updateUser(user.id, { pin_hash: hashPin(newPin) });
  await setSession({ userId: user.id });
  return NextResponse.json({ ok: true });
}
