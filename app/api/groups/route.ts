import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setSession, hashPin } from "@/lib/session";
import { generateInviteCode, isValidHHMM, isValidPin } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });

  const { groupName, name, pin, scheduledTime, avatar } = body;
  if (!groupName?.trim() || !name?.trim()) {
    return NextResponse.json({ error: "그룹 이름과 닉네임을 입력해 주세요." }, { status: 400 });
  }
  if (groupName.trim().length > 30 || name.trim().length > 20) {
    return NextResponse.json({ error: "이름이 너무 길어요." }, { status: 400 });
  }
  if (!isValidPin(pin)) {
    return NextResponse.json({ error: "PIN은 숫자 4~6자리로 입력해 주세요." }, { status: 400 });
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

  const member = await d.createMember({
    group_id: group.id,
    name: name.trim(),
    pin_hash: hashPin(pin),
    scheduled_time: scheduledTime,
    workdays: "12345",
    avatar: typeof avatar === "string" ? avatar : "onion",
    is_admin: true,
  });

  await setSession({ memberId: member.id, groupId: group.id });
  return NextResponse.json({ ok: true, inviteCode: group.invite_code });
}
