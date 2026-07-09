import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthed, isValidHHMM, isValidPin, isValidWorkdays } from "@/lib/auth";
import { hashPin, verifyPin } from "@/lib/session";
import { allowRequest } from "@/lib/ratelimit";
import { AVATAR_INFO } from "@/lib/types";

export async function PATCH(req: NextRequest) {
  const auth = await getAuthed();
  if (!auth) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });

  const patch: Record<string, string> = {};
  if (body.scheduledTime !== undefined) {
    if (!isValidHHMM(body.scheduledTime)) {
      return NextResponse.json({ error: "기준 시각은 HH:MM 형식이에요." }, { status: 400 });
    }
    patch.scheduled_time = body.scheduledTime;
  }
  if (body.workdays !== undefined) {
    if (!isValidWorkdays(body.workdays)) {
      return NextResponse.json({ error: "근무 요일이 올바르지 않아요." }, { status: 400 });
    }
    patch.workdays = body.workdays;
  }
  if (body.avatar !== undefined) {
    if (!(body.avatar in AVATAR_INFO)) {
      return NextResponse.json({ error: "아바타가 올바르지 않아요." }, { status: 400 });
    }
    patch.avatar = body.avatar;
  }
  if (body.newPin !== undefined) {
    if (!isValidPin(body.newPin)) {
      return NextResponse.json({ error: "새 PIN은 숫자 4~6자리예요." }, { status: 400 });
    }
    // 현재 PIN 확인 (세션 탈취만으로 PIN을 못 바꾸게) + 시도 제한
    if (!allowRequest(`pin:${auth.member.id}`, 5, 60_000)) {
      return NextResponse.json(
        { error: "시도가 너무 많아요. 잠시 후 다시 시도해 주세요." },
        { status: 429 }
      );
    }
    if (typeof body.currentPin !== "string" || !verifyPin(body.currentPin, auth.member.pin_hash)) {
      return NextResponse.json({ error: "현재 PIN이 일치하지 않아요." }, { status: 403 });
    }
    patch.pin_hash = hashPin(body.newPin);
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 내용이 없어요." }, { status: 400 });
  }

  const d = await db();
  await d.updateMember(auth.member.id, patch);
  return NextResponse.json({ ok: true });
}
