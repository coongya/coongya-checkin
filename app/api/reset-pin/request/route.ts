import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { hashPin } from "@/lib/session";
import { isValidEmail } from "@/lib/auth";
import { sendMail } from "@/lib/mailer";
import { allowRequest, clientIp } from "@/lib/ratelimit";

const CODE_TTL_MS = 10 * 60 * 1000; // 10분

// PIN 재설정 1단계: 이메일로 6자리 인증 코드 발송.
// 계정 존재 여부를 노출하지 않기 위해 항상 성공 응답을 돌려준다.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "이메일 주소를 확인해 주세요." }, { status: 400 });
  }

  // 메일 폭탄·계정 탐색 방지: IP당 분당 5회, 이메일당 10분에 3회
  if (
    !allowRequest(`resetreq:${clientIp(req)}`, 5, 60_000) ||
    !allowRequest(`resetmail:${email}`, 3, 10 * 60_000)
  ) {
    return NextResponse.json(
      { error: "시도가 너무 많아요. 잠시 후 다시 시도해 주세요." },
      { status: 429 }
    );
  }

  const d = await db();
  const user = await d.getUserByEmail(email);
  if (user) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
    await d.upsertPinReset(user.id, hashPin(code), expiresAt);
    await sendMail(
      email,
      "쿵야출근단 PIN 재설정 인증 코드",
      `안녕하세요, ${user.username}님!\n\nPIN 재설정 인증 코드: ${code}\n\n10분 안에 입력해 주세요. 본인이 요청하지 않았다면 이 메일을 무시하세요.`
    );
  }
  // 가입되지 않은 이메일이어도 같은 응답 (계정 존재 여부 비노출)
  return NextResponse.json({ ok: true });
}
