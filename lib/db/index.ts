import type { Group, User, Member, Checkin, Absence, ScheduleOverride } from "../types";

// PIN 재설정 임시 코드 (그룹 관리자가 발급, 해시로 저장)
export interface PinReset {
  user_id: string;
  code_hash: string;
  expires_at: string; // ISO
  attempts: number;
}

export interface NewGroup {
  name: string;
  invite_code: string;
  fine_late: number;
  fine_absent: number;
}

export interface NewUser {
  username: string;
  email: string;
  pin_hash: string;
  avatar: string;
}

export interface NewMembership {
  user_id: string;
  group_id: string;
  scheduled_time: string;
  workdays: string;
  is_admin: boolean;
}

export interface NewCheckin {
  member_id: string; // membership id
  work_date: string;
  checked_at: string;
  photo_path: string | null;
  is_late: boolean;
  late_minutes: number;
}

export interface DB {
  // 계정
  createUser(u: NewUser): Promise<User>; // 중복 이메일 → Error("duplicate_email")
  getUser(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  updateUser(
    id: string,
    patch: Partial<Pick<User, "username" | "avatar" | "pin_hash">>
  ): Promise<void>;

  // 그룹
  createGroup(g: NewGroup): Promise<Group>;
  getGroup(id: string): Promise<Group | null>;
  getGroupByInviteCode(code: string): Promise<Group | null>;
  updateGroup(
    id: string,
    patch: Partial<Pick<Group, "name" | "fine_late" | "fine_absent">>
  ): Promise<void>;
  /** 그룹과 모든 하위 데이터(멤버십·출근 기록·휴가·사진) 삭제 */
  deleteGroup(id: string): Promise<void>;

  // 멤버십 (Member = 멤버십 + 계정 이름/아바타 뷰)
  // 조회 메서드는 활동 중(left_at 없음)인 멤버십만 반환한다.
  createMembership(m: NewMembership): Promise<Member>; // 중복 → Error("duplicate_membership")
  getMembership(id: string): Promise<Member | null>;
  getMembershipByUserAndGroup(userId: string, groupId: string): Promise<Member | null>;
  listMembershipsByUser(userId: string): Promise<{ member: Member; group: Group }[]>;
  listMembers(groupId: string): Promise<Member[]>;
  /** 나간 멤버 포함 전체 멤버십 — 월별 통계에서 "나간 달까지 표시"에 사용 */
  listAllMembers(groupId: string): Promise<Member[]>;
  updateMembership(
    id: string,
    patch: Partial<Pick<Member, "scheduled_time" | "workdays" | "is_admin">>
  ): Promise<void>;
  /** 그룹 나가기 — left_at을 기록하는 소프트 삭제. 기록은 남지만 집계에서 제외된다. */
  leaveMembership(id: string): Promise<void>;

  // 출근/휴가/기준시각 변경 (member_id = membership id)
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

  // PIN 재설정 임시 코드 (유저당 1개, upsert)
  upsertPinReset(userId: string, codeHash: string, expiresAt: string): Promise<void>;
  getPinReset(userId: string): Promise<PinReset | null>;
  incrementPinResetAttempts(userId: string): Promise<void>;
  deletePinReset(userId: string): Promise<void>;

  // 사진
  uploadPhoto(path: string, data: Buffer, contentType: string): Promise<void>;
  photoUrl(path: string): string;
  getPhoto(path: string): Promise<{ data: Buffer; contentType: string } | null>;
  /** 브라우저가 Storage에서 직접 받을 수 있는 시간제한 서명 URL. 미지원(mock)이면 null */
  getPhotoSignedUrl(path: string): Promise<string | null>;
  /** beforeDate 이전 출근 기록의 사진 파일만 삭제 (기록·통계는 보존). 삭제한 개수 반환 */
  purgeOldPhotos(groupId: string, beforeDate: string): Promise<number>;
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
