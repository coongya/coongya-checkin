import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { parseRestDeInfo, shouldReplaceYear, syncHolidays, loadHolidays } from "./holidays";
import { memoryDb } from "./db/memory";
import type { Holiday } from "./types";

// 특일정보 API(getRestDeInfo)의 JSON 응답 모양
function apiBody(items: unknown, resultCode = "00"): string {
  return JSON.stringify({
    response: {
      header: { resultCode, resultMsg: resultCode === "00" ? "NORMAL SERVICE." : "ERROR" },
      body: { items, numOfRows: 100, pageNo: 1, totalCount: 0 },
    },
  });
}
const item = (locdate: number, dateName: string, isHoliday = "Y") => ({
  dateKind: "01",
  dateName,
  isHoliday,
  locdate,
  seq: 1,
});

beforeEach(() => {
  // 메모리 DB는 globalThis에 저장소를 두므로 테스트마다 초기화
  (globalThis as { __kungyaStore?: unknown }).__kungyaStore = undefined;
});

test("여러 항목을 날짜(YYYY-MM-DD)·이름으로 변환한다", () => {
  const body = apiBody({ item: [item(20261009, "한글날"), item(20260101, "1월1일")] });
  assert.deepEqual(parseRestDeInfo(body), [
    { date: "2026-01-01", name: "1월1일" },
    { date: "2026-10-09", name: "한글날" },
  ]);
});

test("항목이 하나면 배열이 아닌 객체로 와도 읽는다", () => {
  const body = apiBody({ item: item(20260603, "전국동시지방선거") });
  assert.deepEqual(parseRestDeInfo(body), [{ date: "2026-06-03", name: "전국동시지방선거" }]);
});

test("항목이 없으면(items가 빈 문자열) 빈 목록을 돌려준다", () => {
  assert.deepEqual(parseRestDeInfo(apiBody("")), []);
});

test("쉬지 않는 날(isHoliday가 Y가 아님)은 제외한다", () => {
  const body = apiBody({ item: [item(20260717, "제헌절", "N"), item(20260815, "광복절")] });
  assert.deepEqual(parseRestDeInfo(body), [{ date: "2026-08-15", name: "광복절" }]);
});

test("같은 날짜의 공휴일은 이름을 합쳐 한 줄로 만든다", () => {
  const body = apiBody({ item: [item(20250505, "어린이날"), item(20250505, "부처님오신날")] });
  assert.deepEqual(parseRestDeInfo(body), [{ date: "2025-05-05", name: "어린이날·부처님오신날" }]);
});

test("에러 시 오는 XML 응답은 예외로 처리한다", () => {
  const xml =
    "<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg>" +
    "<returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>";
  assert.throws(() => parseRestDeInfo(xml), /SERVICE_KEY_IS_NOT_REGISTERED_ERROR/);
});

test("에러가 JSON(OpenAPI_ServiceResponse)으로 와도 사유를 담아 예외로 처리한다", () => {
  const body = JSON.stringify({
    OpenAPI_ServiceResponse: {
      cmmMsgHeader: {
        errMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR",
        returnAuthMsg: "등록되지 않은 서비스키",
        returnReasonCode: "30",
      },
    },
  });
  assert.throws(() => parseRestDeInfo(body), /SERVICE_KEY_IS_NOT_REGISTERED_ERROR/);
});

test("resultCode가 정상(00)이 아니면 예외로 처리한다", () => {
  assert.throws(() => parseRestDeInfo(apiBody("", "99")), /99/);
});

test("받아온 목록이 비었거나 기존보다 줄었으면 덮어쓰지 않는다", () => {
  assert.equal(shouldReplaceYear(0, 0), false);
  assert.equal(shouldReplaceYear(15, 0), false);
  assert.equal(shouldReplaceYear(15, 14), false);
  assert.equal(shouldReplaceYear(0, 15), true);
  assert.equal(shouldReplaceYear(15, 15), true);
  assert.equal(shouldReplaceYear(15, 16), true);
});

const H = (date: string, name: string): Holiday => ({ date, name });

test("동기화하면 받아온 공휴일이 저장된다", async () => {
  const d = memoryDb();
  const results = await syncHolidays(d, [2026], async () => [H("2026-10-09", "한글날")]);
  assert.deepEqual(await d.listHolidays("2026-01-01", "2026-12-31"), [H("2026-10-09", "한글날")]);
  assert.deepEqual(results, [{ year: 2026, status: "updated", count: 1 }]);
});

test("날짜가 바뀐 공휴일은 옛 날짜가 지워진다", async () => {
  const d = memoryDb();
  await d.replaceHolidays(2026, [H("2026-08-14", "임시공휴일")]);
  await syncHolidays(d, [2026], async () => [H("2026-08-17", "임시공휴일")]);
  assert.deepEqual(await d.listHolidays("2026-01-01", "2026-12-31"), [H("2026-08-17", "임시공휴일")]);
});

test("조회에 실패한 해는 기존 데이터를 지키고 다른 해는 계속 동기화한다", async () => {
  const d = memoryDb();
  await d.replaceHolidays(2026, [H("2026-10-09", "한글날")]);
  const results = await syncHolidays(d, [2026, 2027], async (year) => {
    if (year === 2026) throw new Error("timeout");
    return [H("2027-01-01", "1월1일")];
  });
  assert.deepEqual(await d.listHolidays("2026-01-01", "2027-12-31"), [
    H("2026-10-09", "한글날"),
    H("2027-01-01", "1월1일"),
  ]);
  assert.deepEqual(results, [
    { year: 2026, status: "failed", count: 0, reason: "timeout" },
    { year: 2027, status: "updated", count: 1 },
  ]);
});

test("받아온 목록이 기존보다 줄었으면 기존 데이터를 유지한다", async () => {
  const d = memoryDb();
  await d.replaceHolidays(2026, [H("2026-10-05", "대체공휴일"), H("2026-10-09", "한글날")]);
  const results = await syncHolidays(d, [2026], async () => [H("2026-10-09", "한글날")]);
  assert.equal((await d.listHolidays("2026-01-01", "2026-12-31")).length, 2);
  assert.equal(results[0].status, "skipped");
});

test("기간 안의 공휴일을 날짜→이름 맵으로 불러온다", async () => {
  const d = memoryDb();
  await d.replaceHolidays(2026, [H("2026-10-05", "대체공휴일"), H("2026-12-25", "기독탄신일")]);
  const map = await loadHolidays(d, "2026-10-01", "2026-10-31");
  assert.deepEqual([...map], [["2026-10-05", "대체공휴일"]]);
});

test("DB 조회가 실패하면 공휴일 없음으로 간주한다 (화면이 죽지 않게)", async () => {
  const broken = {
    listHolidays: async () => {
      throw new Error('relation "holidays" does not exist');
    },
  };
  const map = await loadHolidays(broken, "2026-10-01", "2026-10-31");
  assert.equal(map.size, 0);
});
