// 시간 계산 유틸 — 모든 판정은 서버 수신 시각을 KST(Asia/Seoul) 기준으로 처리한다.

const TZ = "Asia/Seoul";

export interface KstParts {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  hhmmss: string; // HH:MM:SS
  isoWeekday: number; // 월=1 ... 일=7
  minutesOfDay: number;
}

export function kstParts(d: Date = new Date()): KstParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) parts[p.type] = p.value;
  const hour = parts.hour === "24" ? "00" : parts.hour;
  const weekdayMap: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
  };
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    date,
    time: `${hour}:${parts.minute}`,
    hhmmss: `${hour}:${parts.minute}:${parts.second}`,
    isoWeekday: weekdayMap[parts.weekday] ?? 1,
    minutesOfDay: parseInt(hour, 10) * 60 + parseInt(parts.minute, 10),
  };
}

export function minutesFromHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  return h * 60 + m;
}

/** 특정 날짜(YYYY-MM-DD)의 ISO 요일 (타임존 무관, 달력 요일) */
export function isoWeekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map((x) => parseInt(x, 10));
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=일
  return wd === 0 ? 7 : wd;
}

export function isWorkday(dateStr: string, workdays: string): boolean {
  return workdays.includes(String(isoWeekdayOf(dateStr)));
}

/** 지각 판정: 체크인 시각(KST)과 기준 시각 비교 */
export function judgeLate(
  checkedAt: Date,
  scheduledTime: string
): { isLate: boolean; lateMinutes: number } {
  const now = kstParts(checkedAt);
  const diff = now.minutesOfDay - minutesFromHHMM(scheduledTime);
  return { isLate: diff > 0, lateMinutes: Math.max(0, diff) };
}

/** 해당 월(YYYY-MM)의 날짜 목록. endDate(포함)까지만. */
export function datesOfMonth(month: string, endDate?: string): string[] {
  const [y, m] = month.split("-").map((x) => parseInt(x, 10));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) {
    const ds = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (endDate && ds > endDate) break;
    out.push(ds);
  }
  return out;
}

export function fmtTimeKST(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function fmtWon(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}
