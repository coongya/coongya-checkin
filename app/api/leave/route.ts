import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthed } from "@/lib/auth";
import { setCurrentGroupId, clearCurrentGroupId } from "@/lib/session";

// 그룹 나가기 — 소프트 삭제(left_at 기록). 기록·사진은 남지만
// 나간 뒤에는 그룹 화면·집계·랭킹에서 제외된다.
export async function POST(req: NextRequest) {
  const auth = await getAuthed();
  if (!auth) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const groupId: string | null =
    typeof body?.groupId === "string" ? body.groupId : (auth.current?.group.id ?? null);
  if (!groupId) {
    return NextResponse.json({ error: "참여 중인 그룹이 없어요." }, { status: 400 });
  }
  const target = auth.memberships.find((m) => m.group.id === groupId);
  if (!target) {
    return NextResponse.json({ error: "참여하지 않은 그룹이에요." }, { status: 403 });
  }

  const d = await db();
  await d.leaveMembership(target.member.id);

  // 관리자가 나가면 가장 오래된 남은 멤버에게 관리자 위임 (남은 관리자가 없을 때)
  if (target.member.is_admin) {
    const remainingMembers = await d.listMembers(groupId); // 참여일 순 정렬
    if (remainingMembers.length > 0 && !remainingMembers.some((m) => m.is_admin)) {
      await d.updateMembership(remainingMembers[0].id, { is_admin: true });
    }
  }

  // 그룹 쿠키 정리 — 남은 그룹이 있으면 첫 번째 그룹으로 전환
  const remaining = auth.memberships.filter((m) => m.group.id !== groupId);
  if (remaining.length > 0) await setCurrentGroupId(remaining[0].group.id);
  else await clearCurrentGroupId();

  return NextResponse.json({ ok: true });
}
