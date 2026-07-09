import { redirect } from "next/navigation";
import { getAuthed } from "@/lib/auth";
import { db } from "@/lib/db";
import { kstParts, fmtTimeKST, isWorkday } from "@/lib/time";
import { avatarInfo } from "@/lib/types";
import { TopBar, TabBar } from "@/components/Nav";
import CheckinCard from "@/components/CheckinCard";
import KungyaFace from "@/components/KungyaFace";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const auth = await getAuthed();
  if (!auth) redirect("/");
  const { member, group } = auth;

  const d = await db();
  const kst = kstParts();
  const today = kst.date;
  const members = await d.listMembers(group.id);
  const ids = members.map((m) => m.id);
  const checkins = await d.listCheckins(ids, today, today);
  const absences = await d.listAbsences(ids, today, today);
  const overrides = await d.listOverrides(ids, today, today);
  const effectiveTime = (m: (typeof members)[number]) =>
    overrides.find((o) => o.member_id === m.id)?.scheduled_time ?? m.scheduled_time;

  const myCheckin = checkins.find((c) => c.member_id === member.id);
  const myAbsence = absences.find((a) => a.member_id === member.id);

  const rows = members.map((m) => {
    const c = checkins.find((x) => x.member_id === m.id);
    const a = absences.find((x) => x.member_id === m.id);
    const workday = isWorkday(today, m.workdays);
    let badge: { cls: string; label: string };
    if (a) badge = { cls: "excused", label: `🏠 ${a.reason}` };
    else if (c)
      badge = c.is_late
        ? { cls: "late", label: `😭 지각 +${c.late_minutes}분` }
        : { cls: "onTime", label: "🥳 출근" };
    else if (!workday) badge = { cls: "restDay", label: "휴무" };
    else badge = { cls: "pending", label: "😴 미출근" };
    return { m, c, badge };
  });

  const photos = rows
    .filter((r) => r.c?.photo_path)
    .map((r) => ({
      name: r.m.name,
      avatar: r.m.avatar,
      time: fmtTimeKST(r.c!.checked_at),
      url: d.photoUrl(r.c!.photo_path!),
      late: r.c!.is_late,
    }));

  return (
    <>
      <TopBar groupName={group.name} />
      <main className="container">
        <CheckinCard
          avatar={member.avatar}
          scheduledTime={effectiveTime(member)}
          alreadyChecked={!!myCheckin}
          checkedTime={myCheckin ? fmtTimeKST(myCheckin.checked_at) : undefined}
          wasLate={myCheckin?.is_late}
          lateMinutes={myCheckin?.late_minutes}
          isWorkdayToday={isWorkday(today, member.workdays)}
          hasAbsenceToday={!!myAbsence}
        />

        <div className="card">
          <h2>오늘의 쿵야들 ({rows.filter((r) => r.c).length}/{rows.length} 출근)</h2>
          {rows.map(({ m, c, badge }) => (
            <div className="member-row" key={m.id}>
              <div className="face">
                <KungyaFace avatar={m.avatar} size={34} />
              </div>
              <div className="who">
                <div className="nm">
                  {m.name}
                  {m.id === member.id && " (나)"}
                </div>
                <div className="sub">
                  기준 {effectiveTime(m)}
                  {c && ` · ${fmtTimeKST(c.checked_at)} 인증`}
                </div>
              </div>
              <span className={`badge ${badge.cls}`}>{badge.label}</span>
            </div>
          ))}
        </div>

        {photos.length > 0 && (
          <div className="card">
            <h2>오늘의 인증샷 📸</h2>
            <div className="feed">
              {photos.map((p, i) => (
                <figure key={i}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={`${p.name}의 출근 인증`} />
                  <figcaption>
                    {avatarInfo(p.avatar).emoji} {p.name} · {p.time}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        )}

        <div className="card" style={{ textAlign: "center" }}>
          <p className="muted" style={{ margin: "0 0 8px" }}>
            친구를 초대하려면 초대코드를 공유하세요
          </p>
          <span className="invite-chip">{group.invite_code}</span>
        </div>
      </main>
      <TabBar />
    </>
  );
}
