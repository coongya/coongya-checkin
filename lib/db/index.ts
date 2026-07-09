import type { Group, Member, Checkin, Absence, ScheduleOverride } from "../types";

export interface NewGroup {
  name: string;
  invite_code: string;
  fine_late: number;
  fine_absent: number;
}

export interface NewMember {
  group_id: string;
  name: string;
  pin_hash: string;
  scheduled_time: string;
  workdays: string;
  avatar: string;
  is_admin: boolean;
}

export interface NewCheckin {
  member_id: string;
  work_date: string;
  checked_at: string;
  photo_path: string | null;
  is_late: boolean;
  late_minutes: number;
}

export interface DB {
  createGroup(g: NewGroup): Promise<Group>;
  getGroup(id: string): Promise<Group | null>;
  getGroupByInviteCode(code: string): Promise<Group | null>;
  updateGroup(
    id: string,
    patch: Partial<Pick<Group, "name" | "fine_late" | "fine_absent">>
  ): Promise<void>;

  createMember(m: NewMember): Promise<Member>;
  getMember(id: string): Promise<Member | null>;
  getMemberByName(groupId: string, name: string): Promise<Member | null>;
  listMembers(groupId: string): Promise<Member[]>;
  updateMember(
    id: string,
    patch: Partial<Pick<Member, "scheduled_time" | "workdays" | "avatar" | "pin_hash">>
  ): Promise<void>;

  createCheckin(c: NewCheckin): Promise<Checkin>;
  getCheckin(memberId: string, workDate: string): Promise<Checkin | null>;
  listCheckins(memberIds: string[], from: string, to: string): Promise<Checkin[]>;

  createAbsence(memberId: string, workDate: string, reason: string): Promise<Absence>;
  deleteAbsence(memberId: string, workDate: string): Promise<void>;
  listAbsences(memberIds: string[], from: string, to: string): Promise<Absence[]>;

  upsertOverride(memberId: string, workDate: string, time: string): Promise<ScheduleOverride>;
  deleteOverride(memberId: string, workDate: string): Promise<void>;
  getOverride(memberId: string, workDate: string): Promise<ScheduleOverride | null>;
  listOverrides(memberIds: string[], from: string, to: string): Promise<ScheduleOverride[]>;

  uploadPhoto(path: string, data: Buffer, contentType: string): Promise<void>;
  photoUrl(path: string): string;
  getPhoto(path: string): Promise<{ data: Buffer; contentType: string } | null>;
}

export function isMock(): boolean {
  return process.env.MOCK_DB === "1" || !process.env.NEXT_PUBLIC_SUPABASE_URL;
}

let _db: DB | null = null;

export async function db(): Promise<DB> {
  if (_db) return _db;
  if (isMock()) {
    const { memoryDb } = await import("./memory");
    _db = memoryDb();
  } else {
    const { supabaseDb } = await import("./supabase");
    _db = supabaseDb();
  }
  return _db;
}
