import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthed, isValidHHMM, isValidPin, isValidWorkdays, validateUsername } from "@/lib/auth";
import { hashPin, verifyPin } from "@/lib/session";
import { allowRequest } from "@/lib/ratelimit";
import { AVATAR_INFO } from "@/lib/types";

// 내 설정 변경
// - scheduledTime / workdays: 현재 그룹의 멤버십 설정
// - username / avatar / (currentPin + newPin): 계정 설정 (모든 그룹에 반영)
export async function PATCH(req: NextRequest) {
  const auth = await getAuthed();
  if (!auth) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });

  const d = await db();
  const membershipPatch: Record<string, string> = {};
  const userPatch: Record<string, string> = {};

  if (body.scheduledTime !== undefined) {
    if (!isValidHHMM(body.scheduledTime)) {
      return NextResponse.json({ error: "기준 시각은 HH:MM 형식이에요." }, { status: 400 });
    }
    membershipPatch.scheduled_time = body.scheduledTime;
  }
  if (body.workdays !== undefined) {
    if (!isValidWorkdays(body.workdays)) {
      return NextResponse.json({ error: "근무 요일이 올바르지 않아요." }, { status: 400 });
    }
    membershipPatch.workdays = body.workdays;
  }
  if (body.username !== undefined) {
    const checked = validateUsername(body.username);
    if ("error" in checked) {
      return NextResponse.json({ error: checked.error }, { status: 400 });
    }
    userPatch.username = checked.name;
  }
  if (body.avatar !== undefined) {
    if (!(body.avatar in AVATAR_INFO)) {
      return NextResponse.json({ error: "아바타가 올바르지 않아요." }, { status: 400 });
    }
    userPatch.avatar = body.avatar;
  }
  if (body.newPin !== undefined) {
    if (!isValidPin(body.newPin)) {
      return NextResponse.json({ error: "새 PIN은 숫자 4~6자리예요." }, { status: 400 });
    }
    // 현재 PIN 확인 (세션 탈취만으로 PIN을 못 바꾸게) + 시도 제한
    if (!allowRequest(`pin:${auth.user.id}`, 5, 60_000)) {
      return NextResponse.json(
        { error: "시도가 너무 많아요. 잠시 후 다시 시도해 주세요." },
        { status: 429 }
      );
    }
    if (typeof body.currentPin !== "string" || !verifyPin(body.currentPin, auth.user.pin_hash)) {
      return NextResponse.json({ error: "현재 PIN이 일치하지 않아요." }, { status: 403 });
    }
    userPatch.pin_hash = hashPin(body.newPin);
  }

  if (Object.keys(membershipPatch).length === 0 && Object.keys(userPatch).length === 0) {
    return NextResponse.json({ error: "변경할 내용이 없어요." }, { status: 400 });
  }

  if (Object.keys(membershipPatch).length > 0) {
    if (!auth.current) {
      return NextResponse.json({ error: "참여 중인 그룹이 없어요." }, { status: 400 });
    }
    await d.updateMembership(auth.current.member.id, membershipPatch);
  }
  if (Object.keys(userPatch).length > 0) {
    await d.updateUser(auth.user.id, userPatch);
  }
  return NextResponse.json({ ok: true });
}
