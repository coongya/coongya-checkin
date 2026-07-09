import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setCurrentGroupId } from "@/lib/session";
import { getAuthed, isValidHHMM } from "@/lib/auth";
import { allowRequest, clientIp } from "@/lib/ratelimit";

// 초대코드로 그룹 참여 (로그인 필요)
export async function POST(req: NextRequest) {
  const auth = await getAuthed();
  if (!auth) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });

  const { inviteCode, scheduledTime } = body;
  if (!inviteCode?.trim()) {
    return NextResponse.json({ error: "초대코드를 입력해 주세요." }, { status: 400 });
  }
  if (!isValidHHMM(scheduledTime)) {
    return NextResponse.json({ error: "기준 출근 시각이 올바르지 않아요." }, { status: 400 });
  }
  // 초대코드 무차별 탐색 방지: IP당 분당 10회
  if (!allowRequest(`join:${clientIp(req)}`, 10, 60_000)) {
    return NextResponse.json(
      { error: "시도가 너무 많아요. 잠시 후 다시 시도해 주세요." },
      { status: 429 }
    );
  }

  const d = await db();
  const group = await d.getGroupByInviteCode(inviteCode.trim());
  if (!group) {
    return NextResponse.json({ error: "초대코드에 해당하는 그룹이 없어요." }, { status: 404 });
  }

  try {
    await d.createMembership({
      user_id: auth.user.id,
      group_id: group.id,
      scheduled_time: scheduledTime,
      workdays: "12345",
      is_admin: false,
    });
    await setCurrentGroupId(group.id);
    return NextResponse.json({ ok: true, groupName: group.name });
  } catch (e) {
    if (e instanceof Error && e.message === "duplicate_membership") {
      return NextResponse.json({ error: "이미 참여 중인 그룹이에요." }, { status: 409 });
    }
    return NextResponse.json({ error: "참여에 실패했어요." }, { status: 500 });
  }
}
