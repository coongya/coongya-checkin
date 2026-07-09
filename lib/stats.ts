// 통계/벌금 계산 — 순수 함수로 분리해 테스트 가능하게 유지
import type { Group, Member, Checkin, Absence, DayStatus } from "./types";
import { datesOfMonth, isWorkday, kstParts } from "./time";

/** ISO 타임스탬프의 KST 날짜(YYYY-MM-DD). 값이 없으면 null. */
function kstDateOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return kstParts(d).date;
}

export interface DayRecord {
  date: string;
  status: DayStatus;
  checkin?: Checkin;
  absence?: Absence;
  fine: number;
}

export interface MemberMonthStats {
  member: Member;
  days: DayRecord[];
  workdayCount: number; // 오늘까지 지난 근무일 수 (오늘 포함)
  onTimeCount: number;
  lateCount: number;
  lateMinutesTotal: number;
  excusedCount: number;
  absentCount: number;
  totalFine: number;
}

/**
 * 한 멤버의 월간 기록 계산.
 * @param todayStr 오늘 날짜(KST, YYYY-MM-DD) — 이 날짜까지만 판정. 오늘 미인증은 pending.
 */
export function memberMonthStats(
  group: Group,
  member: Member,
  month: string,
  todayStr: string,
  checkins: Checkin[],
  absences: Absence[]
): MemberMonthStats {
  const byDateCheckin = new Map(checkins.map((c) => [c.work_date, c]));
  const byDateAbsence = new Map(absences.map((a) => [a.work_date, a]));
  // 그룹 참여일 이전은 판정 대상에서 제외 (참여 전 날짜에 벌금이 붙지 않도록)
  const joinedDate = kstDateOf(member.created_at);

  const days: DayRecord[] = [];
  let onTimeCount = 0,
    lateCount = 0,
    lateMinutesTotal = 0,
    excusedCount = 0,
    absentCount = 0,
    workdayCount = 0,
    totalFine = 0;

  for (const date of datesOfMonth(month)) {
    let status: DayStatus;
    let fine = 0;
    const checkin = byDateCheckin.get(date);
    const absence = byDateAbsence.get(date);

    if (date > todayStr) {
      status = "future";
    } else if (joinedDate && date < joinedDate && !checkin && !absence) {
      status = "restDay"; // 참여 전
    } else if (!isWorkday(date, member.workdays)) {
      status = "restDay";
    } else {
      workdayCount++;
      if (absence) {
        status = "excused"; // 휴가/사유 — 벌금 면제
        excusedCount++;
      } else if (checkin) {
        if (checkin.is_late) {
          status = "late";
          lateCount++;
          lateMinutesTotal += checkin.late_minutes;
          fine = group.fine_late;
        } else {
          status = "onTime";
          onTimeCount++;
        }
      } else if (date === todayStr) {
        status = "pending"; // 오늘은 아직 기회가 있음
        workdayCount--; // 판정 전이므로 통계 분모에서 제외
      } else {
        status = "absent"; // 무단 미출근
        absentCount++;
        fine = group.fine_absent;
      }
    }
    totalFine += fine;
    days.push({ date, status, checkin, absence, fine });
  }

  return {
    member,
    days,
    workdayCount,
    onTimeCount,
    lateCount,
    lateMinutesTotal,
    excusedCount,
    absentCount,
    totalFine,
  };
}

export function groupMonthStats(
  group: Group,
  members: Member[],
  month: string,
  todayStr: string,
  checkins: Checkin[],
  absences: Absence[]
): MemberMonthStats[] {
  return members.map((m) =>
    memberMonthStats(
      group,
      m,
      month,
      todayStr,
      checkins.filter((c) => c.member_id === m.id),
      absences.filter((a) => a.member_id === m.id)
    )
  );
}

/**
 * 경쟁 순위(competition ranking, "1224") 계산.
 * 정렬된 배열에서 키가 같으면 같은 등수, 다음 등수는 인원수만큼 건너뜀.
 * SQL의 RANK() OVER (ORDER BY ...) 와 동일한 방식.
 */
export function competitionRanks<T>(sorted: T[], keyOf: (x: T) => string): number[] {
  const ranks: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    ranks.push(i > 0 && keyOf(sorted[i]) === keyOf(sorted[i - 1]) ? ranks[i - 1] : i + 1);
  }
  return ranks;
}

export const STATUS_LABEL: Record<DayStatus, string> = {
  onTime: "출근",
  late: "지각",
  excused: "휴가",
  absent: "미출근",
  pending: "대기",
  restDay: "휴무",
  future: "-",
};

export const STATUS_EMOJI: Record<DayStatus, string> = {
  onTime: "🥳",
  late: "😭",
  excused: "🏠",
  absent: "😴",
  pending: "⏳",
  restDay: "·",
  future: "",
};
