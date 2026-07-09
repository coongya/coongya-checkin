import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthed } from "@/lib/auth";
import { db } from "@/lib/db";
import { kstParts, fmtWon, datesOfMonth, isoWeekdayOf } from "@/lib/time";
import { groupMonthStats, competitionRanks, memberVisibleInMonth, STATUS_EMOJI } from "@/lib/stats";
import { TopBar, TabBar } from "@/components/Nav";
import KungyaFace from "@/components/KungyaFace";

export const dynamic = "force-dynamic";

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map((x) => parseInt(x, 10));
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function Stats({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const auth = await getAuthed();
  if (!auth) redirect("/");
  if (!auth.current) redirect("/groups");
  const { member, group } = auth.current;

  const kst = kstParts();
  const currentMonth = kst.date.slice(0, 7);
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : currentMonth;

  const d = await db();
  // 나간 멤버도 나간 달까지는 통계에 표시 (다음 달부터 제외)
  const members = (await d.listAllMembers(group.id)).filter((m) =>
    memberVisibleInMonth(m, month)
  );
  const ids = members.map((m) => m.id);
  const monthDates = datesOfMonth(month);
  const from = monthDates[0];
  const to = monthDates[monthDates.length - 1];
  const checkins = await d.listCheckins(ids, from, to);
  const absences = await d.listAbsences(ids, from, to);

  const stats = groupMonthStats(group, members, month, kst.date, checkins, absences);
  const myStats = stats.find((s) => s.member.id === member.id);

  // 랭킹: 벌금 많은 순 / 정시 출근 많은 순 — 동점자는 공동 순위 (RANK() 방식)
  const fineRank = [...stats].sort((a, b) => b.totalFine - a.totalFine);
  const fineRanks = competitionRanks(fineRank, (s) => String(s.totalFine));
  const diligentRank = [...stats].sort(
    (a, b) => b.onTimeCount - a.onTimeCount || a.lateCount - b.lateCount
  );
  const diligentRanks = competitionRanks(
    diligentRank,
    (s) => `${s.onTimeCount}:${s.lateCount}`
  );
  const medalFor = (rank: number) =>
    rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}`;

  // 내 달력
  const firstDow = isoWeekdayOf(`${month}-01`);

  return (
    <>
      <TopBar groupName={group.name} />
      <main className="container">
        <div className="month-nav">
          <Link href={`/stats?m=${shiftMonth(month, -1)}`}>← 이전</Link>
          <span className="mn">{month.replace("-", "년 ")}월</span>
          {month < currentMonth ? (
            <Link href={`/stats?m=${shiftMonth(month, 1)}`}>다음 →</Link>
          ) : (
            <span style={{ width: 64 }} />
          )}
        </div>

        <div className="card">
          <h2>이달의 성적표 📋</h2>
          <table className="stat-table">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>쿵야</th>
                <th>출근</th>
                <th>지각</th>
                <th>휴가</th>
                <th>미출근</th>
                <th>벌금</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.member.id}>
                  <td className="nm">
                    <KungyaFace avatar={s.member.avatar} /> {s.member.name}
                    {s.member.id === member.id && " ⭐"}
                    {s.member.left_at && (
                      <span className="muted" style={{ fontSize: 11 }}>
                        {" "}
                        (나감)
                      </span>
                    )}
                  </td>
                  <td>{s.onTimeCount}</td>
                  <td>{s.lateCount > 0 ? `${s.lateCount} (+${s.lateMinutesTotal}분)` : 0}</td>
                  <td>{s.excusedCount}</td>
                  <td>{s.absentCount}</td>
                  <td className="fine">{s.totalFine > 0 ? fmtWon(s.totalFine) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ marginBottom: 0 }}>
            지각 {fmtWon(group.fine_late)} · 무단 미출근 {fmtWon(group.fine_absent)} · 휴가 등록
            시 면제
          </p>
        </div>

        {myStats && (
          <div className="card">
            <h2>나의 출근 달력 🗓️</h2>
            <div className="cal">
              {["월", "화", "수", "목", "금", "토", "일"].map((w) => (
                <div className="cell dow" key={w}>
                  {w}
                </div>
              ))}
              {Array.from({ length: firstDow - 1 }).map((_, i) => (
                <div key={`sp${i}`} style={{ background: "transparent" }} />
              ))}
              {myStats.days.map((day) => {
                // 미래 날짜라도 휴가가 등록되어 있으면 미리 🏝 도장 표시
                const excusedLike =
                  day.status === "excused" || (day.status === "future" && !!day.absence);
                const cls = excusedLike
                  ? "excused"
                  : ["onTime", "late", "absent", "pending"].includes(day.status)
                    ? day.status
                    : "";
                const dnum = parseInt(day.date.slice(8), 10);
                return (
                  <div
                    key={day.date}
                    className={`cell ${cls}`}
                    title={`${day.date} ${excusedLike ? `🏝 ${day.absence?.reason ?? ""}` : STATUS_EMOJI[day.status]}`}
                  >
                    {day.status === "onTime" ? (
                      <>
                        <span className="stamp">
                          <KungyaFace avatar={member.avatar} />
                        </span>
                        <span className="dnum">{dnum}</span>
                      </>
                    ) : excusedLike ? (
                      <>
                        <span className="stamp">🏝</span>
                        <span className="dnum">{dnum}</span>
                      </>
                    ) : (
                      dnum
                    )}
                  </div>
                );
              })}
            </div>
            <div className="legend">
              <span className="l-on">정시 출근</span>
              <span className="l-late">지각</span>
              <span className="l-exc">휴가</span>
              <span className="l-abs">미출근</span>
            </div>
          </div>
        )}

        <div className="card">
          <h2>벌금왕 랭킹 💸</h2>
          {fineRank.map((s, i) => (
            <div className="rank-row" key={s.member.id}>
              <span className="medal">{s.totalFine > 0 ? medalFor(fineRanks[i]) : "😇"}</span>
              <span className="nm">
                <KungyaFace avatar={s.member.avatar} /> {s.member.name}
              </span>
              <span className={`val ${s.totalFine > 0 ? "bad" : ""}`}>
                {s.totalFine > 0 ? fmtWon(s.totalFine) : "벌금 없음"}
              </span>
            </div>
          ))}
        </div>

        <div className="card">
          <h2>성실왕 랭킹 🌟</h2>
          {diligentRank.map((s, i) => (
            <div className="rank-row" key={s.member.id}>
              <span className="medal">{medalFor(diligentRanks[i])}</span>
              <span className="nm">
                <KungyaFace avatar={s.member.avatar} /> {s.member.name}
              </span>
              <span className="val">정시 {s.onTimeCount}회</span>
            </div>
          ))}
        </div>
      </main>
      <TabBar />
    </>
  );
}
