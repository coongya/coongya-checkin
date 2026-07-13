// 통계/벌금 계산 — 순수 함수로 분리해 테스트 가능하게 유지
import type { Group, Member, Checkin, Absence, DayStatus, FineRule } from "./types";
import { datesOfMonth, isWorkday, kstParts } from "./time";

/** ISO 타임스탬프의 KST 날짜(YYYY-MM-DD). 값이 없으면 null. */
function kstDateOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return kstParts(d).date;
}

/** 나간 멤버는 나간 달(KST)까지만 통계·기록에 표시하고 다음 달부터 제외 */
export function memberVisibleInMonth(member: Member, month: string): boolean {
  if (!member.left_at) return true;
  const leftDate = kstDateOf(member.left_at);
  return leftDate ? month <= leftDate.slice(0, 7) : true;
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
 * 특정 날짜에 유효한 벌금 금액. 이력(effective_from 오름차순)에서 그 날짜 이전에
 * 마지막으로 적용된 금액을 찾고, 이력이 없으면 그룹의 현재 금액을 쓴다.
 * 금액을 바꿔도 과거 날짜의 벌금이 다시 계산되지 않도록 하기 위한 장치.
 */
export function finesOn(
  group: Group,
  fineHistory: FineRule[],
  date: string
): { late: number; absent: number } {
  let late = group.fine_late;
  let absent = group.fine_absent;
  for (const r of fineHistory) {
    if (r.effective_from > date) break;
    late = r.fine_late;
    absent = r.fine_absent;
  }
  return { late, absent };
}

/**
 * 한 멤버의 월간 기록 계산.
 * @param todayStr 오늘 날짜(KST, YYYY-MM-DD) — 이 날짜까지만 판정. 오늘 미인증은 pending.
 * @param fineHistory 벌금 변경 이력 — 날짜별로 그 시점의 금액을 적용 (없으면 현재 금액)
 */
export function memberMonthStats(
  group: Group,
  member: Member,
  month: string,
  todayStr: string,
  checkins: Checkin[],
  absences: Absence[],
  fineHistory: FineRule[] = []
): MemberMonthStats {
  const byDateCheckin = new Map(checkins.map((c) => [c.work_date, c]));
  const byDateAbsence = new Map(absences.map((a) => [a.work_date, a]));
  // 그룹 참여일 이전은 판정 대상에서 제외 (참여 전 날짜에 벌금이 붙지 않도록)
  const joinedDate = kstDateOf(member.created_at);
  // 그룹을 나간 뒤의 날짜도 판정 제외 (나간 뒤에 벌금이 쌓이지 않도록)
  const leftDate = kstDateOf(member.left_at);

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
    } else if (group.start_date && date < group.start_date && !checkin && !absence) {
      status = "restDay"; // 그룹 시작일 전 — 기록·벌금 대상 아님
    } else if (joinedDate && date < joinedDate && !checkin && !absence) {
      status = "restDay"; // 참여 전
    } else if (leftDate && date > leftDate && !checkin && !absence) {
      status = "restDay"; // 나간 뒤
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
          fine = finesOn(group, fineHistory, date).late;
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
        fine = finesOn(group, fineHistory, date).absent;
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
  absences: Absence[],
  fineHistory: FineRule[] = []
): MemberMonthStats[] {
  return members.map((m) =>
    memberMonthStats(
      group,
      m,
      month,
      todayStr,
      checkins.filter((c) => c.member_id === m.id),
      absences.filter((a) => a.member_id === m.id),
      fineHistory
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
