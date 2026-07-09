import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthed } from "@/lib/auth";

// 현재 그룹의 설정 변경 (관리자 전용)
export async function PATCH(req: NextRequest) {
  const auth = await getAuthed();
  if (!auth?.current) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }
  if (!auth.current.member.is_admin) {
    return NextResponse.json({ error: "그룹 관리자만 변경할 수 있어요." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });

  const patch: Record<string, number | string> = {};
  for (const [from, to] of [
    ["fineLate", "fine_late"],
    ["fineAbsent", "fine_absent"],
  ] as const) {
    if (body[from] !== undefined) {
      const v = Number(body[from]);
      if (!Number.isInteger(v) || v < 0 || v > 10_000_000) {
        return NextResponse.json({ error: "벌금 금액이 올바르지 않아요." }, { status: 400 });
      }
      patch[to] = v;
    }
  }
  if (typeof body.name === "string" && body.name.trim()) {
    patch.name = body.name.trim().slice(0, 30);
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 내용이 없어요." }, { status: 400 });
  }

  const d = await db();
  await d.updateGroup(auth.current.group.id, patch);
  return NextResponse.json({ ok: true });
}
