import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { getAuthed } from "@/lib/auth";
import { hashPin } from "@/lib/session";
import { allowRequest } from "@/lib/ratelimit";

const CODE_TTL_MS = 30 * 60 * 1000; // 30분 — 관리자가 멤버에게 전달할 시간

// 그룹 관리자가 멤버의 PIN 재설정 임시 코드를 발급한다.
// 코드는 관리자 화면에 한 번만 표시되고, 멤버가 로그인 화면에서 사용한다.
export async function POST(req: NextRequest) {
  const auth = await getAuthed();
  if (!auth?.current) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }
  if (!auth.current.member.is_admin) {
    return NextResponse.json({ error: "그룹 관리자만 발급할 수 있어요." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const memberId = body?.memberId;
  if (typeof memberId !== "string") {
    return NextResponse.json({ error: "대상을 선택해 주세요." }, { status: 400 });
  }
  if (!allowRequest(`adminreset:${auth.user.id}`, 5, 60_000)) {
    return NextResponse.json(
      { error: "시도가 너무 많아요. 잠시 후 다시 시도해 주세요." },
      { status: 429 }
    );
  }

  const d = await db();
  const target = await d.getMembership(memberId);
  if (!target || target.group_id !== auth.current.group.id) {
    return NextResponse.json({ error: "이 그룹의 멤버가 아니에요." }, { status: 404 });
  }
  // 본인 PIN은 이 경로로 재설정 불가 — 세션을 훔친 사람이 PIN 확인 없이
  // 계정을 탈취하는 걸 막기 위함. 관리자 본인은 운영자에게 문의.
  if (target.user_id === auth.user.id) {
    return NextResponse.json(
      { error: "본인 PIN은 발급할 수 없어요. 다른 관리자나 운영자에게 요청하세요." },
      { status: 400 }
    );
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  await d.upsertPinReset(target.user_id, hashPin(code), expiresAt);

  return NextResponse.json({ ok: true, code, expiresInMinutes: 30 });
}
