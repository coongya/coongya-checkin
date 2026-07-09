import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setSession, hashPin } from "@/lib/session";
import { isValidHHMM, isValidPin } from "@/lib/auth";
import { allowRequest, clientIp } from "@/lib/ratelimit";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });

  const { inviteCode, name, pin, scheduledTime, avatar } = body;
  if (!inviteCode?.trim() || !name?.trim()) {
    return NextResponse.json({ error: "초대코드와 닉네임을 입력해 주세요." }, { status: 400 });
  }
  if (name.trim().length > 20) {
    return NextResponse.json({ error: "닉네임은 20자 이하로 입력해 주세요." }, { status: 400 });
  }
  // 초대코드 무차별 탐색 방지: IP당 분당 10회
  if (!allowRequest(`join:${clientIp(req)}`, 10, 60_000)) {
    return NextResponse.json(
      { error: "시도가 너무 많아요. 잠시 후 다시 시도해 주세요." },
      { status: 429 }
    );
  }
  if (!isValidPin(pin)) {
    return NextResponse.json({ error: "PIN은 숫자 4~6자리로 입력해 주세요." }, { status: 400 });
  }
  if (!isValidHHMM(scheduledTime)) {
    return NextResponse.json({ error: "기준 출근 시각이 올바르지 않아요." }, { status: 400 });
  }

  const d = await db();
  const group = await d.getGroupByInviteCode(inviteCode.trim());
  if (!group) {
    return NextResponse.json({ error: "초대코드에 해당하는 그룹이 없어요." }, { status: 404 });
  }

  try {
    const member = await d.createMember({
      group_id: group.id,
      name: name.trim(),
      pin_hash: hashPin(pin),
      scheduled_time: scheduledTime,
      workdays: "12345",
      avatar: typeof avatar === "string" ? avatar : "onion",
      is_admin: false,
    });
    await setSession({ memberId: member.id, groupId: group.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "duplicate_name") {
      return NextResponse.json(
        { error: "이미 같은 닉네임이 있어요. 로그인하거나 다른 닉네임을 써 주세요." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "참여에 실패했어요." }, { status: 500 });
  }
}
