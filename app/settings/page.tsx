import { redirect } from "next/navigation";
import { getAuthed } from "@/lib/auth";
import { db } from "@/lib/db";
import { kstParts } from "@/lib/time";
import { TopBar, TabBar } from "@/components/Nav";
import {
  MemberSettings,
  AbsenceManager,
  OverrideManager,
  GroupSettings,
} from "@/components/SettingsForms";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const auth = await getAuthed();
  if (!auth) redirect("/");
  if (!auth.current) redirect("/groups");
  const { member, group } = auth.current;

  const d = await db();
  const today = kstParts().date;
  // 최근 30일 ~ 향후 1년의 등록 내역
  const past = new Date();
  past.setDate(past.getDate() - 30);
  const from = past.toISOString().slice(0, 10);
  const future = new Date();
  future.setFullYear(future.getFullYear() + 1);
  const to = future.toISOString().slice(0, 10);
  const absences = (await d.listAbsences([member.id], from, to)).sort((a, b) =>
    a.work_date.localeCompare(b.work_date)
  );
  const overrides = (await d.listOverrides([member.id], today, to)).sort((a, b) =>
    a.work_date.localeCompare(b.work_date)
  );
  // 관리자용 PIN 재설정 대상 — 본인 제외한 활동 중 멤버
  const resetTargets = member.is_admin
    ? (await d.listMembers(group.id))
        .filter((m) => m.user_id !== auth.user.id)
        .map((m) => ({ id: m.id, name: m.name }))
    : [];

  return (
    <>
      <TopBar groupName={group.name} />
      <main className="container">
        <p className="muted" style={{ margin: "0 0 10px" }}>
          이 화면의 설정은 <b>{group.name}</b> 그룹에만 적용돼요. 닉네임·캐릭터·PIN은
          오른쪽 위 ☰ → 내 정보 수정에서 바꿀 수 있어요.
        </p>
        <MemberSettings
          scheduledTime={member.scheduled_time}
          workdays={member.workdays}
        />
        <AbsenceManager absences={absences} />
        <OverrideManager overrides={overrides} defaultTime={member.scheduled_time} />
        <GroupSettings
          isAdmin={member.is_admin}
          fineLate={group.fine_late}
          fineAbsent={group.fine_absent}
          inviteCode={group.invite_code}
          groupName={group.name}
          resetTargets={resetTargets}
        />
        <p className="muted" style={{ textAlign: "center" }}>
          오늘 날짜(KST): {today} · 시각 판정은 서버 기준이에요
        </p>
      </main>
      <TabBar />
    </>
  );
}
