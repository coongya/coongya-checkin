import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthed } from "@/lib/auth";
import { db } from "@/lib/db";
import { kstParts, fmtTimeKST, isWorkday } from "@/lib/time";
import { avatarInfo } from "@/lib/types";
import { TopBar, TabBar } from "@/components/Nav";
import KungyaFace from "@/components/KungyaFace";
import InviteCode from "@/components/InviteCode";

export const dynamic = "force-dynamic";

// 그룹의 오늘 인증 현황 — 오늘 화면에서 그룹을 누르면 들어온다. ← 로 복귀.
export default async function GroupToday({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const auth = await getAuthed();
  if (!auth) redirect("/");

  const { groupId } = await params;
  const mine = auth.memberships.find((m) => m.group.id === groupId);
  if (!mine) redirect("/dashboard"); // 참여하지 않은 그룹
  const { member, group } = mine;

  const d = await db();
  const today = kstParts().date;
  const members = await d.listMembers(group.id);
  const ids = members.map((m) => m.id);
  const checkins = await d.listCheckins(ids, today, today);
  const absences = await d.listAbsences(ids, today, today);
  const overrides = await d.listOverrides(ids, today, today);
  const effectiveTime = (m: (typeof members)[number]) =>
    overrides.find((o) => o.member_id === m.id)?.scheduled_time ?? m.scheduled_time;

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
      <TopBar groupName="" />
      <main className="container">
        <div className="backrow">
          <Link href="/dashboard" className="back-btn" aria-label="오늘 화면으로">
            ←
          </Link>
          <h1>
            {group.name}
            {member.is_admin && " 👑"}
          </h1>
        </div>

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
            친구를 초대하려면 초대코드를 공유하세요 (누르면 복사돼요)
          </p>
          <InviteCode code={group.invite_code} />
        </div>
      </main>
      <TabBar />
    </>
  );
}
