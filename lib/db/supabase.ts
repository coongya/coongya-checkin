import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Group, User, Member, Checkin, Absence, ScheduleOverride } from "../types";
import type { DB, NewGroup, NewUser, NewMembership, NewCheckin, PinReset } from "./index";

const BUCKET = "checkin-photos";
// memberships + users 조인 셀렉트 — Member 뷰를 만들기 위함
const MEMBER_SELECT = "*, users(username, avatar)";

function client(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

interface MembershipJoined {
  id: string;
  user_id: string;
  group_id: string;
  scheduled_time: string;
  workdays: string;
  is_admin: boolean;
  created_at: string;
  left_at: string | null;
  users: { username: string; avatar: string } | null;
}

function toMember(row: MembershipJoined): Member {
  return {
    id: row.id,
    user_id: row.user_id,
    group_id: row.group_id,
    name: row.users?.username ?? "?",
    avatar: row.users?.avatar ?? "onion",
    scheduled_time: row.scheduled_time,
    workdays: row.workdays,
    is_admin: row.is_admin,
    created_at: row.created_at,
    left_at: row.left_at ?? null,
  };
}

export function supabaseDb(): DB {
  const sb = client();
  return {
    async createUser(nu: NewUser) {
      const { data, error } = await sb.from("users").insert(nu).select().single();
      if (error) {
        if (error.code === "23505") throw new Error("duplicate_email");
        throw new Error(error.message);
      }
      return data as User;
    },
    async getUser(id) {
      const { data } = await sb.from("users").select().eq("id", id).maybeSingle();
      return (data as User) ?? null;
    },
    async getUserByEmail(email) {
      const { data } = await sb.from("users").select().eq("email", email).maybeSingle();
      return (data as User) ?? null;
    },
    async updateUser(id, patch) {
      const { error } = await sb.from("users").update(patch).eq("id", id);
      fail(error);
    },

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
    async deleteGroup(id) {
      // 이 그룹 체크인만 참조하는 사진을 Storage에서 삭제 (다른 그룹 체크인과 공유 가능)
      const { data: ms } = await sb.from("memberships").select("id").eq("group_id", id);
      const memberIds = ((ms ?? []) as { id: string }[]).map((m) => m.id);
      if (memberIds.length > 0) {
        const { data: rows } = await sb
          .from("checkins")
          .select("photo_path")
          .in("member_id", memberIds)
          .not("photo_path", "is", null);
        const paths = [
          ...new Set(((rows ?? []) as { photo_path: string }[]).map((r) => r.photo_path)),
        ];
        if (paths.length > 0) {
          const { data: refs } = await sb
            .from("checkins")
            .select("member_id, photo_path")
            .in("photo_path", paths);
          const memberSet = new Set(memberIds);
          const shared = new Set(
            ((refs ?? []) as { member_id: string; photo_path: string }[])
              .filter((r) => !memberSet.has(r.member_id))
              .map((r) => r.photo_path)
          );
          const removable = paths.filter((p) => !shared.has(p));
          if (removable.length > 0) {
            await sb.storage.from(BUCKET).remove(removable);
          }
        }
      }
      // 그룹 행 삭제 — memberships/checkins/absences/overrides는 FK cascade로 함께 삭제
      const { error } = await sb.from("groups").delete().eq("id", id);
      fail(error);
    },

    async createMembership(nm: NewMembership) {
      const { data, error } = await sb
        .from("memberships")
        .insert(nm)
        .select(MEMBER_SELECT)
        .single();
      if (error) {
        if (error.code === "23505") throw new Error("duplicate_membership");
        throw new Error(error.message);
      }
      return toMember(data as MembershipJoined);
    },
    async getMembership(id) {
      const { data } = await sb
        .from("memberships")
        .select(MEMBER_SELECT)
        .eq("id", id)
        .is("left_at", null)
        .maybeSingle();
      return data ? toMember(data as MembershipJoined) : null;
    },
    async getMembershipByUserAndGroup(userId, groupId) {
      const { data } = await sb
        .from("memberships")
        .select(MEMBER_SELECT)
        .eq("user_id", userId)
        .eq("group_id", groupId)
        .is("left_at", null)
        .maybeSingle();
      return data ? toMember(data as MembershipJoined) : null;
    },
    async listMembershipsByUser(userId) {
      const { data, error } = await sb
        .from("memberships")
        .select("*, users(username, avatar), groups(*)")
        .eq("user_id", userId)
        .is("left_at", null)
        .order("created_at");
      fail(error);
      return ((data ?? []) as (MembershipJoined & { groups: Group })[])
        .filter((row) => row.groups)
        .map((row) => ({ member: toMember(row), group: row.groups }));
    },
    async listMembers(groupId) {
      const { data, error } = await sb
        .from("memberships")
        .select(MEMBER_SELECT)
        .eq("group_id", groupId)
        .is("left_at", null)
        .order("created_at");
      fail(error);
      return ((data ?? []) as MembershipJoined[]).map(toMember);
    },
    async listAllMembers(groupId) {
      const { data, error } = await sb
        .from("memberships")
        .select(MEMBER_SELECT)
        .eq("group_id", groupId)
        .order("created_at");
      fail(error);
      return ((data ?? []) as MembershipJoined[]).map(toMember);
    },
    async updateMembership(id, patch) {
      const { error } = await sb.from("memberships").update(patch).eq("id", id);
      fail(error);
    },
    async leaveMembership(id) {
      const { error } = await sb
        .from("memberships")
        .update({ left_at: new Date().toISOString() })
        .eq("id", id);
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

    async upsertPinReset(userId, codeHash, expiresAt) {
      const { error } = await sb.from("pin_resets").upsert(
        { user_id: userId, code_hash: codeHash, expires_at: expiresAt, attempts: 0 },
        { onConflict: "user_id" }
      );
      fail(error);
    },
    async getPinReset(userId) {
      const { data } = await sb
        .from("pin_resets")
        .select()
        .eq("user_id", userId)
        .maybeSingle();
      return (data as PinReset) ?? null;
    },
    async incrementPinResetAttempts(userId) {
      const { data } = await sb
        .from("pin_resets")
        .select("attempts")
        .eq("user_id", userId)
        .maybeSingle();
      if (!data) return;
      const { error } = await sb
        .from("pin_resets")
        .update({ attempts: (data.attempts as number) + 1 })
        .eq("user_id", userId);
      fail(error);
    },
    async deletePinReset(userId) {
      const { error } = await sb.from("pin_resets").delete().eq("user_id", userId);
      fail(error);
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
    async getPhotoSignedUrl(path) {
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 600);
      if (error || !data?.signedUrl) {
        if (error) console.error(`[photo] 서명 URL 발급 실패: ${path} — ${error.message}`);
        return null;
      }
      return data.signedUrl;
    },
    async getPhoto(path) {
      const { data, error } = await sb.storage.from(BUCKET).download(path);
      if (error || !data) {
        if (error) console.error(`[photo] Storage 다운로드 실패: ${path} — ${error.message}`);
        return null;
      }
      return {
        data: Buffer.from(await data.arrayBuffer()),
        contentType: data.type || "image/jpeg",
      };
    },
    async purgeOldPhotos(groupId, beforeDate) {
      const { data: members } = await sb
        .from("memberships")
        .select("id")
        .eq("group_id", groupId);
      const ids = (members ?? []).map((m: { id: string }) => m.id);
      if (ids.length === 0) return 0;
      // 한 번에 최대 200건씩 정리 (체크인마다 호출되므로 점진적으로 비워짐)
      const { data: rows, error } = await sb
        .from("checkins")
        .select("id, photo_path")
        .in("member_id", ids)
        .lt("work_date", beforeDate)
        .not("photo_path", "is", null)
        .limit(200);
      fail(error);
      const targets = (rows ?? []) as { id: string; photo_path: string }[];
      if (targets.length === 0) return 0;
      const { error: rmErr } = await sb.storage
        .from(BUCKET)
        .remove(targets.map((t) => t.photo_path));
      fail(rmErr);
      const { error: upErr } = await sb
        .from("checkins")
        .update({ photo_path: null })
        .in(
          "id",
          targets.map((t) => t.id)
        );
      fail(upErr);
      return targets.length;
    },
  };
}
