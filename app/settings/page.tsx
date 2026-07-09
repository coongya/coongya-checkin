import { redirect } from "next/navigation";
import { getAuthed } from "@/lib/auth";
import { db } from "@/lib/db";
import { kstParts } from "@/lib/time";
import { TopBar, TabBar } from "@/components/Nav";
import {
  MemberSettings,
  AbsenceManager,
  OverrideManager,
  PinChange,
  GroupSettings,
} from "@/components/SettingsForms";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const auth = await getAuthed();
  if (!auth) redirect("/");
  const { member, group } = auth;

  const d = await db();
  const today = kstParts().date;
  // 오늘 이후(오늘 포함) 등록된 휴가 + 최근 30일
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

  return (
    <>
      <TopBar groupName={group.name} />
      <main className="container">
        <MemberSettings
          scheduledTime={member.scheduled_time}
          workdays={member.workdays}
          avatar={member.avatar}
        />
        <AbsenceManager absences={absences} />
        <OverrideManager overrides={overrides} defaultTime={member.scheduled_time} />
        <PinChange />
        <GroupSettings
          isAdmin={member.is_admin}
          fineLate={group.fine_late}
          fineAbsent={group.fine_absent}
          inviteCode={group.invite_code}
          groupName={group.name}
        />
        <p className="muted" style={{ textAlign: "center" }}>
          오늘 날짜(KST): {today} · 시각 판정은 서버 기준이에요
        </p>
      </main>
      <TabBar />
    </>
  );
}
