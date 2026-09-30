// 공휴일 연동 — 공공데이터포털 "한국천문연구원_특일 정보"(getRestDeInfo)를 DB에 동기화한다.
// 화면·통계는 외부 API를 직접 부르지 않고 DB에 저장된 값만 읽는다.
import type { DB } from "./db";
import type { Holiday } from "./types";

const ENDPOINT =
  "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";

interface RestDeItem {
  dateName?: string;
  isHoliday?: string;
  locdate?: number | string; // 20261009
}

interface RestDeResponse {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: { items?: { item?: RestDeItem | RestDeItem[] } | "" };
  };
  // 키 오류 등 게이트웨이 단계의 실패는 이 모양으로 온다 (HTTP 403 등)
  OpenAPI_ServiceResponse?: {
    cmmMsgHeader?: { errMsg?: string; returnAuthMsg?: string };
  };
}

/**
 * 특일정보 API 응답 본문 → 공휴일 목록(날짜 오름차순).
 * 이 API는 항목이 1개면 배열 대신 객체, 0개면 items가 ""로 오고,
 * 키 오류 등 실패 시에는 OpenAPI_ServiceResponse(JSON 또는 XML)를 돌려준다 —
 * 실패는 사유를 담아 예외로 알린다.
 */
export function parseRestDeInfo(body: string): Holiday[] {
  let json: RestDeResponse;
  try {
    json = JSON.parse(body);
  } catch {
    const tags = ["errMsg", "returnAuthMsg"]
      .map((t) => body.match(new RegExp(`<${t}>([^<]*)<`))?.[1])
      .filter(Boolean);
    throw new Error(`특일정보 API 오류: ${tags.join(" ") || body.slice(0, 100)}`);
  }
  const gw = json.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (gw) {
    throw new Error(`특일정보 API 오류: ${gw.errMsg ?? ""} ${gw.returnAuthMsg ?? ""}`.trim());
  }
  const header = json.response?.header;
  if (header?.resultCode !== "00") {
    throw new Error(`특일정보 API 오류: ${header?.resultCode} ${header?.resultMsg ?? ""}`.trim());
  }

  const items = json.response?.body?.items;
  const raw = items ? items.item : undefined;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];

  // 같은 날짜에 공휴일이 겹치면(예: 어린이날·부처님오신날) 이름을 합쳐 한 줄로
  const byDate = new Map<string, string>();
  for (const it of list) {
    if (it.isHoliday !== "Y") continue;
    const s = String(it.locdate ?? "");
    if (!/^\d{8}$/.test(s)) continue;
    const date = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    const name = it.dateName?.trim() || "공휴일";
    const prev = byDate.get(date);
    byDate.set(date, prev ? `${prev}·${name}` : name);
  }
  return [...byDate]
    .map(([date, name]) => ({ date, name }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 받아온 목록으로 그 해의 공휴일을 덮어써도 되는지.
 * 공휴일이 사라지면 그날 미출근 벌금이 되살아나므로, 비었거나 기존보다 줄어든
 * 응답은 일시적 오류로 보고 덮어쓰지 않는다. (공휴일은 늘어날 뿐 취소되는 일이 거의 없다)
 */
export function shouldReplaceYear(existingCount: number, fetchedCount: number): boolean {
  return fetchedCount > 0 && fetchedCount >= existingCount;
}

/** 환경변수의 서비스 키. 포털의 "Encoding" 키(%가 들어 있음)를 넣어도 동작하게 풀어서 쓴다. */
export function holidayApiKey(): string | null {
  const key = process.env.HOLIDAY_API_KEY?.trim();
  if (!key) return null;
  try {
    return key.includes("%") ? decodeURIComponent(key) : key;
  } catch {
    return key;
  }
}

/** 특일정보 API에서 한 해의 공휴일 조회 */
export async function fetchYearHolidays(year: number, serviceKey: string): Promise<Holiday[]> {
  const params = new URLSearchParams({
    serviceKey,
    solYear: String(year),
    numOfRows: "100",
    _type: "json",
  });
  const res = await fetch(`${ENDPOINT}?${params}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.text();
  if (!res.ok) {
    // 키 오류 등은 본문에 사유가 담겨 온다 — 파서가 그 사유로 예외를 던진다
    parseRestDeInfo(body);
    throw new Error(`HTTP ${res.status}`);
  }
  return parseRestDeInfo(body);
}

export interface HolidaySyncResult {
  year: number;
  status: "updated" | "skipped" | "failed";
  count: number; // 받아온 공휴일 수
  reason?: string;
}

/**
 * 연도별로 공휴일을 받아 DB를 교체한다. 한 해가 실패해도 기존 데이터는 그대로 두고
 * 나머지 해는 계속 진행한다.
 */
export async function syncHolidays(
  d: Pick<DB, "listHolidays" | "replaceHolidays">,
  years: number[],
  fetchYear: (year: number) => Promise<Holiday[]>
): Promise<HolidaySyncResult[]> {
  const results: HolidaySyncResult[] = [];
  for (const year of years) {
    try {
      const fetched = await fetchYear(year);
      const existing = await d.listHolidays(`${year}-01-01`, `${year}-12-31`);
      if (!shouldReplaceYear(existing.length, fetched.length)) {
        results.push({
          year,
          status: "skipped",
          count: fetched.length,
          reason: `기존 ${existing.length}건보다 적음`,
        });
        continue;
      }
      await d.replaceHolidays(year, fetched);
      results.push({ year, status: "updated", count: fetched.length });
    } catch (e) {
      results.push({
        year,
        status: "failed",
        count: 0,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return results;
}

/**
 * from~to 기간의 공휴일(날짜 → 이름). 조회에 실패하면(예: holidays 테이블을 아직
 * 만들지 않음) 공휴일 없음으로 간주해 화면은 기존처럼 요일만으로 판정한다.
 */
export async function loadHolidays(
  d: Pick<DB, "listHolidays">,
  from: string,
  to: string
): Promise<Map<string, string>> {
  try {
    const rows = await d.listHolidays(from, to);
    return new Map(rows.map((h) => [h.date, h.name]));
  } catch (e) {
    console.error("[holidays] 조회 실패:", e instanceof Error ? e.message : e);
    return new Map();
  }
}
