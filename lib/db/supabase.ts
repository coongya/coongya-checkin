import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Group, Member, Checkin, Absence, ScheduleOverride } from "../types";
import type { DB, NewGroup, NewMember, NewCheckin } from "./index";

const BUCKET = "checkin-photos";

function client(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export function supabaseDb(): DB {
  const sb = client();
  return {
    async createGroup(ng: NewGroup) {
      const { data, error } = await sb.from("groups").insert(ng).select().single();
      fail(error);
      return data as Group;
    },
    async getGroup(id) {
      const { data } = await sb.from("groups").select().eq("id", id).maybeSingle();
      return (data as Group) ?? null;
    },
    async getGroupByInviteCode(code) {
      const { data } = await sb
        .from("groups")
        .select()
        .eq("invite_code", code.toUpperCase())
        .maybeSingle();
      return (data as Group) ?? null;
    },
    async updateGroup(id, patch) {
      const { error } = await sb.from("groups").update(patch).eq("id", id);
      fail(error);
    },

    async createMember(nm: NewMember) {
      const { data, error } = await sb.from("members").insert(nm).select().single();
      if (error) {
        if (error.code === "23505") throw new Error("duplicate_name");
        throw new Error(error.message);
      }
      return data as Member;
    },
    async getMember(id) {
      const { data } = await sb.from("members").select().eq("id", id).maybeSingle();
      return (data as Member) ?? null;
    },
    async getMemberByName(groupId, name) {
      const { data } = await sb
        .from("members")
        .select()
        .eq("group_id", groupId)
        .eq("name", name)
        .maybeSingle();
      return (data as Member) ?? null;
    },
    async listMembers(groupId) {
      const { data, error } = await sb
        .from("members")
        .select()
        .eq("group_id", groupId)
        .order("created_at");
      fail(error);
      return (data as Member[]) ?? [];
    },
    async updateMember(id, patch) {
      const { error } = await sb.from("members").update(patch).eq("id", id);
      fail(error);
    },

    async createCheckin(nc: NewCheckin) {
      const { data, error } = await sb.from("checkins").insert(nc).select().single();
      if (error) {
        if (error.code === "23505") throw new Error("already_checked_in");
        throw new Error(error.message);
      }
      return data as Checkin;
    },
    async getCheckin(memberId, workDate) {
      const { data } = await sb
        .from("checkins")
        .select()
        .eq("member_id", memberId)
        .eq("work_date", workDate)
        .maybeSingle();
      return (data as Checkin) ?? null;
    },
    async listCheckins(memberIds, from, to) {
      if (memberIds.length === 0) return [];
      const { data, error } = await sb
        .from("checkins")
        .select()
        .in("member_id", memberIds)
        .gte("work_date", from)
        .lte("work_date", to);
      fail(error);
      return (data as Checkin[]) ?? [];
    },

    async createAbsence(memberId, workDate, reason) {
      const { data, error } = await sb
        .from("absences")
        .insert({ member_id: memberId, work_date: workDate, reason })
        .select()
        .single();
      if (error) {
        if (error.code === "23505") throw new Error("already_exists");
        throw new Error(error.message);
      }
      return data as Absence;
    },
    async deleteAbsence(memberId, workDate) {
      const { error } = await sb
        .from("absences")
        .delete()
        .eq("member_id", memberId)
        .eq("work_date", workDate);
      fail(error);
    },
    async listAbsences(memberIds, from, to) {
      if (memberIds.length === 0) return [];
      const { data, error } = await sb
        .from("absences")
        .select()
        .in("member_id", memberIds)
        .gte("work_date", from)
        .lte("work_date", to);
      fail(error);
      return (data as Absence[]) ?? [];
    },

    async upsertOverride(memberId, workDate, time) {
      const { data, error } = await sb
        .from("schedule_overrides")
        .upsert(
          { member_id: memberId, work_date: workDate, scheduled_time: time },
          { onConflict: "member_id,work_date" }
        )
        .select()
        .single();
      fail(error);
      return data as ScheduleOverride;
    },
    async deleteOverride(memberId, workDate) {
      const { error } = await sb
        .from("schedule_overrides")
        .delete()
        .eq("member_id", memberId)
        .eq("work_date", workDate);
      fail(error);
    },
    async getOverride(memberId, workDate) {
      const { data } = await sb
        .from("schedule_overrides")
        .select()
        .eq("member_id", memberId)
        .eq("work_date", workDate)
        .maybeSingle();
      return (data as ScheduleOverride) ?? null;
    },
    async listOverrides(memberIds, from, to) {
      if (memberIds.length === 0) return [];
      const { data, error } = await sb
        .from("schedule_overrides")
        .select()
        .in("member_id", memberIds)
        .gte("work_date", from)
        .lte("work_date", to);
      fail(error);
      return (data as ScheduleOverride[]) ?? [];
    },

    async uploadPhoto(path, data, contentType) {
      const { error } = await sb.storage.from(BUCKET).upload(path, data, {
        contentType,
        upsert: false,
      });
      fail(error);
    },
    photoUrl(path) {
      // 비공개 버킷: 앱 API를 통해서만 서빙 (그룹 멤버 검증 후 접근)
      return `/api/photo/${path}`;
    },
    async getPhoto(path) {
      const { data, error } = await sb.storage.from(BUCKET).download(path);
      if (error || !data) return null;
      return {
        data: Buffer.from(await data.arrayBuffer()),
        contentType: data.type || "image/jpeg",
      };
    },
  };
}
