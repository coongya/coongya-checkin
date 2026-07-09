import { db } from "./db";
import { getSession, getCurrentGroupId } from "./session";
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

export function isValidWorkdays(s: unknown): s is string {
  return typeof s === "string" && /^[1-7]{1,7}$/.test(s) && new Set(s).size === s.length;
}
