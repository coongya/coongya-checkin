import { db } from "./db";
import { getSession } from "./session";
import type { Group, Member } from "./types";

export interface Authed {
  member: Member;
  group: Group;
}

export async function getAuthed(): Promise<Authed | null> {
  const session = await getSession();
  if (!session) return null;
  const d = await db();
  const member = await d.getMember(session.memberId);
  if (!member) return null;
  const group = await d.getGroup(member.group_id);
  if (!group) return null;
  return { member, group };
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
