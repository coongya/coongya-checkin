import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { pushConfigured } from "@/lib/push";

// 이 기기의 푸시 구독 등록/해제 (로그인 필요)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  if (!pushConfigured()) {
    return NextResponse.json({ error: "서버에 알림 설정이 아직 없어요." }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (
    typeof endpoint !== "string" ||
    !endpoint.startsWith("https://") ||
    endpoint.length > 1000 ||
    typeof p256dh !== "string" ||
    typeof auth !== "string"
  ) {
    return NextResponse.json({ error: "구독 정보가 올바르지 않아요." }, { status: 400 });
  }

  const d = await db();
  await d.upsertPushSubscription({ user_id: session.userId, endpoint, p256dh, auth });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (typeof body?.endpoint !== "string") {
    return NextResponse.json({ error: "구독 정보가 올바르지 않아요." }, { status: 400 });
  }
  const d = await db();
  await d.deletePushSubscription(session.userId, body.endpoint);
  return NextResponse.json({ ok: true });
}
