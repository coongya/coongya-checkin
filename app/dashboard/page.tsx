import { redirect } from "next/navigation";
import { getAuthed } from "@/lib/auth";
import { db } from "@/lib/db";
import { kstParts, isWorkday, minutesFromHHMM } from "@/lib/time";
import { TopBar, TabBar } from "@/components/Nav";
import CheckinCard from "@/components/CheckinCard";
import GroupList, { type GroupListItem } from "@/components/GroupList";
import type { CheckinStatus } from "@/components/StatusKungya";

export const dynamic = "force-dynamic";

// "오늘" 화면 — 인증 카드 + 내 그룹 목록.
// 그룹을 누르면 /group/[id]에서 그 그룹의 오늘 현황을 본다.
export default async function Dashboard() {
  const auth = await getAuthed();
  if (!auth) redirect("/");
  if (auth.memberships.length === 0) redirect("/groups");

  const d = await db();
  const today = kstParts().date;
  const myIds = auth.memberships.map((m) => m.member.id);
  const myCheckins = await d.listCheckins(myIds, today, today);
  const myAbsences = await d.listAbsences(myIds, today, today);
  const myOverrides = await d.listOverrides(myIds, today, today);

  // 그룹별 요약 (멤버 수·출근 수) + 나의 오늘 상태
  const groups: GroupListItem[] = [];
  for (const { member, group } of auth.memberships) {
    const members = await d.listMembers(group.id);
    const checkins = await d.listCheckins(
      members.map((m) => m.id),
      today,
      today
    );
    const myCheckin = myCheckins.find((c) => c.member_id === member.id);
    const myAbsence = myAbsences.find((a) => a.member_id === member.id);
    const workday = isWorkday(today, member.workdays);
    let myBadge: { cls: string; label: string };
    if (myAbsence) myBadge = { cls: "excused", label: `🏠 ${myAbsence.reason}` };
    else if (myCheckin)
      myBadge = myCheckin.is_late
        ? { cls: "late", label: `😭 +${myCheckin.late_minutes}분` }
        : { cls: "onTime", label: "🥳 출근" };
    else if (!workday) myBadge = { cls: "restDay", label: "휴무" };
    else myBadge = { cls: "pending", label: "😴 인증 전" };

    groups.push({
      groupId: group.id,
      name: group.name,
      isAdmin: member.is_admin,
      scheduledTime: member.scheduled_time,
      checkedCount: checkins.length,
      memberCount: members.length,
      myBadge,
    });
  }

  // 인증 카드 상태 — 오늘 근무일인 그룹들 기준
  const effectiveTime = (memberId: string, fallback: string) =>
    myOverrides.find((o) => o.member_id === memberId)?.scheduled_time ?? fallback;
  const workdayMs = auth.memberships.filter(({ member }) => isWorkday(today, member.workdays));
  const activeMs = workdayMs.filter(
    ({ member }) => !myAbsences.some((a) => a.member_id === member.id)
  );
  const uncheckedMs = activeMs.filter(
    ({ member }) => !myCheckins.some((c) => c.member_id === member.id)
  );

  let status: CheckinStatus;
  let countdownTo: string | null = null;
  let lateMinutes = 0;
  if (workdayMs.length > 0 && activeMs.length === 0) {
    status = "excused"; // 근무일인 그룹이 전부 휴가
  } else if (activeMs.length > 0 && uncheckedMs.length === 0) {
    // 인증할 그룹을 모두 인증함 — 하나라도 지각이면 지각으로 표시
    const late = myCheckins.filter((c) => c.is_late);
    status = late.length > 0 ? "late" : "onTime";
    lateMinutes = Math.max(0, ...late.map((c) => c.late_minutes));
  } else {
    status = "before";
    // 아직 인증 안 한 그룹 중 가장 이른 기준 시각까지 카운트다운
    const targets = (uncheckedMs.length > 0 ? uncheckedMs : activeMs).map(({ member }) =>
      effectiveTime(member.id, member.scheduled_time)
    );
    if (targets.length > 0) {
      countdownTo = targets.reduce((a, b) =>
        minutesFromHHMM(a) <= minutesFromHHMM(b) ? a : b
      );
    }
  }

  const groupOptions = auth.memberships.map(({ member, group }) => ({
    groupId: group.id,
    groupName: group.name,
    alreadyChecked: myCheckins.some((c) => c.member_id === member.id),
  }));

  return (
    <>
      <TopBar groupName="" />
      <main className="container">
        <CheckinCard
          avatar={auth.user.avatar}
          status={status}
          lateMinutes={lateMinutes}
          countdownTo={countdownTo}
          isWorkdayToday={workdayMs.length > 0}
          groupOptions={groupOptions}
        />
        <GroupList groups={groups} />
      </main>
      <TabBar />
    </>
  );
}
