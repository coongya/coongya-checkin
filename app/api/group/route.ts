import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthed, isValidStartDate } from "@/lib/auth";
import { setCurrentGroupId, clearCurrentGroupId } from "@/lib/session";
import { kstParts } from "@/lib/time";

// 현재 그룹의 설정 변경 (관리자 전용)
export async function PATCH(req: NextRequest) {
  const auth = await getAuthed();
  if (!auth?.current) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }
  if (!auth.current.member.is_admin) {
    return NextResponse.json({ error: "그룹 관리자만 변경할 수 있어요." }, { status: 403 });
  }
  const group = auth.current.group;

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
  const today = kstParts().date;
  if (body.startDate !== undefined) {
    if (!isValidStartDate(body.startDate, today)) {
      return NextResponse.json(
        { error: "시작일이 올바르지 않아요 (오늘 기준 1년 이내)." },
        { status: 400 }
      );
    }
    patch.start_date = body.startDate;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 내용이 없어요." }, { status: 400 });
  }

  const d = await db();
  await d.updateGroup(group.id, patch);

  // 벌금 금액이 실제로 바뀌면 이력에 기록 — 오늘부터 새 금액, 과거 날짜는 옛 금액 유지
  const newLate = (patch.fine_late as number | undefined) ?? group.fine_late;
  const newAbsent = (patch.fine_absent as number | undefined) ?? group.fine_absent;
  if (newLate !== group.fine_late || newAbsent !== group.fine_absent) {
    await d.upsertFineRule(group.id, today, newLate, newAbsent);
    // 미래 날짜로 남아 있는 규칙(예: 미래 시작일 시드)이 새 금액을 덮지 않도록 정리
    await d.deleteFineRulesAfter(group.id, today);
  }
  // 시작일이 뒤로 당겨지면(더 이른 날짜) 최초 벌금 이력도 그 날짜부터 적용되게 맞춘다
  if (patch.start_date) {
    const history = await d.listFineHistory(group.id);
    const first = history[0];
    if (first && first.effective_from > (patch.start_date as string)) {
      await d.upsertFineRule(
        group.id,
        patch.start_date as string,
        first.fine_late,
        first.fine_absent
      );
    }
  }
  return NextResponse.json({ ok: true });
}

// 현재 그룹 삭제 (관리자 전용) — 멤버십·출근 기록·사진 등 모든 데이터가 삭제된다
export async function DELETE() {
  const auth = await getAuthed();
  if (!auth?.current) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }
  if (!auth.current.member.is_admin) {
    return NextResponse.json({ error: "그룹 관리자만 삭제할 수 있어요." }, { status: 403 });
  }

  const groupId = auth.current.group.id;
  const d = await db();
  await d.deleteGroup(groupId);

  // 그룹 쿠키 정리 — 남은 그룹이 있으면 첫 번째 그룹으로 전환
  const remaining = auth.memberships.filter((m) => m.group.id !== groupId);
  if (remaining.length > 0) await setCurrentGroupId(remaining[0].group.id);
  else await clearCurrentGroupId();

  return NextResponse.json({ ok: true });
}
