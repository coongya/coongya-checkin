import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setCurrentGroupId } from "@/lib/session";
import { getAuthed, generateInviteCode, isValidHHMM } from "@/lib/auth";

// 그룹 만들기 (로그인 필요) — 만든 사람이 관리자
export async function POST(req: NextRequest) {
  const auth = await getAuthed();
  if (!auth) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });

  const { groupName, scheduledTime } = body;
  if (!groupName?.trim() || groupName.trim().length > 30) {
    return NextResponse.json({ error: "그룹 이름을 확인해 주세요 (30자 이하)." }, { status: 400 });
  }
  if (!isValidHHMM(scheduledTime)) {
    return NextResponse.json({ error: "기준 출근 시각이 올바르지 않아요." }, { status: 400 });
  }

  const d = await db();
  // 초대코드 충돌 시 재시도
  let group = null;
  for (let i = 0; i < 5 && !group; i++) {
    try {
      group = await d.createGroup({
        name: groupName.trim(),
        invite_code: generateInviteCode(),
        fine_late: 10000,
        fine_absent: 10000,
      });
    } catch {
      group = null;
    }
  }
  if (!group) return NextResponse.json({ error: "그룹 생성에 실패했어요." }, { status: 500 });

  await d.createMembership({
    user_id: auth.user.id,
    group_id: group.id,
    scheduled_time: scheduledTime,
    workdays: "12345",
    is_admin: true,
  });

  await setCurrentGroupId(group.id);
  return NextResponse.json({ ok: true, inviteCode: group.invite_code });
}
