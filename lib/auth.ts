import { db } from "./db";
import { getSession, getCurrentGroupId } from "./session";
import { containsProfanity } from "./moderation";
import type { Group, User, Member } from "./types";

export interface Authed {
  user: User;
  /** 참여 중인 모든 그룹 */
  memberships: { member: Member; group: Group }[];
  /** 현재 선택된 그룹 컨텍스트 (참여 그룹이 없으면 null) */
  current: { member: Member; group: Group } | null;
}

export async function getAuthed(): Promise<Authed | null> {
  const session = await getSession();
  if (!session) return null;
  const d = await db();
  const user = await d.getUser(session.userId);
  if (!user) return null;
  const memberships = await d.listMembershipsByUser(user.id);

  let current: Authed["current"] = null;
  if (memberships.length > 0) {
    const wanted = await getCurrentGroupId();
    current = memberships.find((m) => m.group.id === wanted) ?? memberships[0];
  }
  return { user, memberships, current };
}

export function generateInviteCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 혼동 문자 제외
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function isValidHHMM(s: unknown): s is string {
  return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function isValidPin(s: unknown): s is string {
  return typeof s === "string" && /^\d{4,6}$/.test(s);
}

export function isValidEmail(s: unknown): s is string {
  return typeof s === "string" && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** 닉네임 검증 (2~20자, 비속어 금지). 통과하면 다듬은 닉네임, 실패하면 에러 메시지 */
export function validateUsername(raw: unknown): { name: string } | { error: string } {
  if (typeof raw !== "string" || !raw.trim()) {
    return { error: "닉네임을 입력해 주세요." };
  }
  const name = raw.trim();
  if (name.length < 2 || name.length > 20) {
    return { error: "닉네임은 2~20자로 입력해 주세요." };
  }
  // 제어문자(줄바꿈 등) 금지 — 화면·이메일 본문 깨짐 방지
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(name)) {
    return { error: "닉네임에 사용할 수 없는 문자가 있어요." };
  }
  if (containsProfanity(name)) {
    return { error: "닉네임에 사용할 수 없는 표현이 포함되어 있어요." };
  }
  return { name };
}

/** 그룹 시작일 검증 — 오늘(KST) 기준 과거 1년 ~ 미래 1년 범위의 YYYY-MM-DD */
export function isValidStartDate(s: unknown, todayStr: string): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = new Date(s + "T00:00:00Z").getTime();
  if (isNaN(t)) return false;
  const today = new Date(todayStr + "T00:00:00Z").getTime();
  const yearMs = 366 * 24 * 60 * 60 * 1000;
  return Math.abs(t - today) <= yearMs;
}

export function isValidWorkdays(s: unknown): s is string {
  return typeof s === "string" && /^[1-7]{1,7}$/.test(s) && new Set(s).size === s.length;
}
