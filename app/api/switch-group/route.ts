import { NextRequest, NextResponse } from "next/server";
import { setCurrentGroupId } from "@/lib/session";
import { getAuthed } from "@/lib/auth";

// 현재 보고 있는 그룹 전환
export async function POST(req: NextRequest) {
  const auth = await getAuthed();
  if (!auth) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const groupId = body?.groupId;
  if (typeof groupId !== "string") {
    return NextResponse.json({ error: "그룹이 올바르지 않아요." }, { status: 400 });
  }
  if (!auth.memberships.some((m) => m.group.id === groupId)) {
    return NextResponse.json({ error: "참여하지 않은 그룹이에요." }, { status: 403 });
  }
  await setCurrentGroupId(groupId);
  return NextResponse.json({ ok: true });
}
