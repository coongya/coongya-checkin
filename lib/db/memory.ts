// 로컬 개발/테스트용 인메모리 DB (MOCK_DB=1). 서버 재시작 시 초기화됩니다.
import { randomUUID } from "node:crypto";
import type { Group, User, Member, Checkin, Absence, ScheduleOverride } from "../types";
import type { DB, NewGroup, NewUser, NewMembership, NewCheckin, PinReset } from "./index";

interface MembershipRow {
  id: string;
  user_id: string;
  group_id: string;
  scheduled_time: string;
  workdays: string;
  is_admin: boolean;
  created_at: string;
  left_at: string | null; // 나간 시각 (null = 활동 중)
}

interface Store {
  users: User[];
  groups: Group[];
  memberships: MembershipRow[];
  checkins: Checkin[];
  absences: Absence[];
  overrides: ScheduleOverride[];
  photos: Map<string, { data: Buffer; contentType: string }>;
  pinResets: Map<string, PinReset>;
}

const g = globalThis as unknown as { __kungyaStore?: Store };

function store(): Store {
  if (!g.__kungyaStore) {
    g.__kungyaStore = {
      users: [],
      groups: [],
      memberships: [],
      checkins: [],
      absences: [],
      overrides: [],
      photos: new Map(),
      pinResets: new Map(),
    };
  }
  return g.__kungyaStore;
}

function toMember(row: MembershipRow): Member {
  const user = store().users.find((u) => u.id === row.user_id);
  return {
    id: row.id,
    user_id: row.user_id,
    group_id: row.group_id,
    name: user?.username ?? "?",
    avatar: user?.avatar ?? "onion",
    scheduled_time: row.scheduled_time,
    workdays: row.workdays,
    is_admin: row.is_admin,
    created_at: row.created_at,
    left_at: row.left_at,
  };
}

export function memoryDb(): DB {
  return {
    async createUser(nu: NewUser) {
      if (store().users.some((u) => u.email === nu.email)) {
        throw new Error("duplicate_email");
      }
      const u: User = { id: randomUUID(), created_at: new Date().toISOString(), ...nu };
      store().users.push(u);
      return u;
    },
    async getUser(id) {
      return store().users.find((u) => u.id === id) ?? null;
    },
    async getUserByEmail(email) {
      return store().users.find((u) => u.email === email) ?? null;
    },
    async updateUser(id, patch) {
      const u = store().users.find((x) => x.id === id);
      if (u) Object.assign(u, patch);
    },

    async createGroup(ng: NewGroup) {
      if (store().groups.some((x) => x.invite_code === ng.invite_code)) {
        throw new Error("duplicate_invite_code");
      }
      const grp: Group = {
        id: randomUUID(),
        timezone: "Asia/Seoul",
        created_at: new Date().toISOString(),
        ...ng,
      };
      store().groups.push(grp);
      return grp;
    },
    async getGroup(id) {
      return store().groups.find((x) => x.id === id) ?? null;
    },
    async getGroupByInviteCode(code) {
      return store().groups.find((x) => x.invite_code === code.toUpperCase()) ?? null;
    },
    async updateGroup(id, patch) {
      const grp = store().groups.find((x) => x.id === id);
      if (grp) Object.assign(grp, patch);
    },
    async deleteGroup(id) {
      const s = store();
      const memberIds = new Set(
        s.memberships.filter((m) => m.group_id === id).map((m) => m.id)
      );
      // 이 그룹 체크인만 참조하는 사진 삭제 (같은 사진을 다른 그룹 체크인이 공유할 수 있음)
      const targetPaths = new Set(
        s.checkins
          .filter((c) => memberIds.has(c.member_id) && c.photo_path)
          .map((c) => c.photo_path!)
      );
      for (const c of s.checkins) {
        if (!memberIds.has(c.member_id) && c.photo_path) targetPaths.delete(c.photo_path);
      }
      for (const p of targetPaths) s.photos.delete(p);
      s.checkins = s.checkins.filter((c) => !memberIds.has(c.member_id));
      s.absences = s.absences.filter((a) => !memberIds.has(a.member_id));
      s.overrides = s.overrides.filter((o) => !memberIds.has(o.member_id));
      s.memberships = s.memberships.filter((m) => m.group_id !== id);
      s.groups = s.groups.filter((g) => g.id !== id);
    },

    async createMembership(nm: NewMembership) {
      if (
        store().memberships.some(
          (m) => m.user_id === nm.user_id && m.group_id === nm.group_id && !m.left_at
        )
      ) {
        throw new Error("duplicate_membership");
      }
      const row: MembershipRow = {
        id: randomUUID(),
        created_at: new Date().toISOString(),
        left_at: null,
        ...nm,
      };
      store().memberships.push(row);
      return toMember(row);
    },
    async getMembership(id) {
      const row = store().memberships.find((m) => m.id === id && !m.left_at);
      return row ? toMember(row) : null;
    },
    async getMembershipByUserAndGroup(userId, groupId) {
      const row = store().memberships.find(
        (m) => m.user_id === userId && m.group_id === groupId && !m.left_at
      );
      return row ? toMember(row) : null;
    },
    async listMembershipsByUser(userId) {
      return store()
        .memberships.filter((m) => m.user_id === userId && !m.left_at)
        .map((row) => ({
          member: toMember(row),
          group: store().groups.find((gr) => gr.id === row.group_id)!,
        }))
        .filter((x) => x.group);
    },
    async listMembers(groupId) {
      return store()
        .memberships.filter((m) => m.group_id === groupId && !m.left_at)
        .map(toMember);
    },
    async listAllMembers(groupId) {
      return store()
        .memberships.filter((m) => m.group_id === groupId)
        .map(toMember);
    },
    async updateMembership(id, patch) {
      const m = store().memberships.find((x) => x.id === id);
      if (m) Object.assign(m, patch);
    },
    async leaveMembership(id) {
      const m = store().memberships.find((x) => x.id === id);
      if (m) m.left_at = new Date().toISOString();
    },

    async createCheckin(nc: NewCheckin) {
      if (store().checkins.some((c) => c.member_id === nc.member_id && c.work_date === nc.work_date)) {
        throw new Error("already_checked_in");
      }
      const c: Checkin = { id: randomUUID(), ...nc };
      store().checkins.push(c);
      return c;
    },
    async getCheckin(memberId, workDate) {
      return (
        store().checkins.find((c) => c.member_id === memberId && c.work_date === workDate) ?? null
      );
    },
    async listCheckins(memberIds, from, to) {
      return store().checkins.filter(
        (c) => memberIds.includes(c.member_id) && c.work_date >= from && c.work_date <= to
      );
    },

    async createAbsence(memberId, workDate, reason) {
      const existing = store().absences.find(
        (a) => a.member_id === memberId && a.work_date === workDate
      );
      if (existing) throw new Error("already_exists");
      const a: Absence = {
        id: randomUUID(),
        member_id: memberId,
        work_date: workDate,
        reason,
        created_at: new Date().toISOString(),
      };
      store().absences.push(a);
      return a;
    },
    async deleteAbsence(memberId, workDate) {
      const s = store();
      s.absences = s.absences.filter(
        (a) => !(a.member_id === memberId && a.work_date === workDate)
      );
    },
    async listAbsences(memberIds, from, to) {
      return store().absences.filter(
        (a) => memberIds.includes(a.member_id) && a.work_date >= from && a.work_date <= to
      );
    },

    async upsertOverride(memberId, workDate, time) {
      const existing = store().overrides.find(
        (o) => o.member_id === memberId && o.work_date === workDate
      );
      if (existing) {
        existing.scheduled_time = time;
        return existing;
      }
      const o: ScheduleOverride = {
        id: randomUUID(),
        member_id: memberId,
        work_date: workDate,
        scheduled_time: time,
        created_at: new Date().toISOString(),
      };
      store().overrides.push(o);
      return o;
    },
    async deleteOverride(memberId, workDate) {
      const s = store();
      s.overrides = s.overrides.filter(
        (o) => !(o.member_id === memberId && o.work_date === workDate)
      );
    },
    async getOverride(memberId, workDate) {
      return (
        store().overrides.find((o) => o.member_id === memberId && o.work_date === workDate) ??
        null
      );
    },
    async listOverrides(memberIds, from, to) {
      return store().overrides.filter(
        (o) => memberIds.includes(o.member_id) && o.work_date >= from && o.work_date <= to
      );
    },

    async upsertPinReset(userId, codeHash, expiresAt) {
      store().pinResets.set(userId, {
        user_id: userId,
        code_hash: codeHash,
        expires_at: expiresAt,
        attempts: 0,
      });
    },
    async getPinReset(userId) {
      return store().pinResets.get(userId) ?? null;
    },
    async incrementPinResetAttempts(userId) {
      const r = store().pinResets.get(userId);
      if (r) r.attempts++;
    },
    async deletePinReset(userId) {
      store().pinResets.delete(userId);
    },

    async uploadPhoto(path, data, contentType) {
      store().photos.set(path, { data, contentType });
    },
    photoUrl(path) {
      return `/api/photo/${path}`;
    },
    async getPhoto(path) {
      return store().photos.get(path) ?? null;
    },
    async purgeOldPhotos(groupId, beforeDate) {
      const s = store();
      const memberIds = new Set(
        s.memberships.filter((m) => m.group_id === groupId).map((m) => m.id)
      );
      let count = 0;
      for (const c of s.checkins) {
        if (memberIds.has(c.member_id) && c.work_date < beforeDate && c.photo_path) {
          s.photos.delete(c.photo_path);
          c.photo_path = null;
          count++;
        }
      }
      return count;
    },
  };
}
