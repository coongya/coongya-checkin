// 로컬 개발/테스트용 인메모리 DB (MOCK_DB=1). 서버 재시작 시 초기화됩니다.
import { randomUUID } from "node:crypto";
import type { Group, Member, Checkin, Absence, ScheduleOverride } from "../types";
import type { DB, NewGroup, NewMember, NewCheckin } from "./index";

interface Store {
  groups: Group[];
  members: Member[];
  checkins: Checkin[];
  absences: Absence[];
  overrides: ScheduleOverride[];
  photos: Map<string, { data: Buffer; contentType: string }>;
}

const g = globalThis as unknown as { __kungyaStore?: Store };

function store(): Store {
  if (!g.__kungyaStore) {
    g.__kungyaStore = { groups: [], members: [], checkins: [], absences: [], overrides: [], photos: new Map() };
  }
  return g.__kungyaStore;
}

export function memoryDb(): DB {
  return {
    async createGroup(ng: NewGroup) {
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

    async createMember(nm: NewMember) {
      if (store().members.some((m) => m.group_id === nm.group_id && m.name === nm.name)) {
        throw new Error("duplicate_name");
      }
      const m: Member = { id: randomUUID(), created_at: new Date().toISOString(), ...nm };
      store().members.push(m);
      return m;
    },
    async getMember(id) {
      return store().members.find((x) => x.id === id) ?? null;
    },
    async getMemberByName(groupId, name) {
      return store().members.find((x) => x.group_id === groupId && x.name === name) ?? null;
    },
    async listMembers(groupId) {
      return store().members.filter((x) => x.group_id === groupId);
    },
    async updateMember(id, patch) {
      const m = store().members.find((x) => x.id === id);
      if (m) Object.assign(m, patch);
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
        s.members.filter((m) => m.group_id === groupId).map((m) => m.id)
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
