import { test } from "node:test";
import assert from "node:assert/strict";
import { memberMonthStats } from "./stats";
import { isWorkday } from "./time";
import type { Group, Member, Absence } from "./types";

const group: Group = {
  id: "g1",
  name: "쿵야출근단",
  invite_code: "ABCDEF",
  fine_late: 1000,
  fine_absent: 5000,
  timezone: "Asia/Seoul",
  start_date: "2026-01-01",
  created_at: "2026-01-01T00:00:00Z",
};
const member: Member = {
  id: "m1",
  user_id: "u1",
  group_id: "g1",
  name: "양파",
  avatar: "onion",
  scheduled_time: "09:00",
  workdays: "12345",
  is_admin: false,
  reminders: "",
  notify_checkin: false,
  created_at: "2025-12-01T00:00:00Z",
  left_at: null,
};
// 2026년 10월: 평일 22일. 10/5(월) 대체공휴일, 10/9(금) 한글날
const holidays = new Map([
  ["2026-10-05", "대체공휴일"],
  ["2026-10-09", "한글날"],
]);
const AFTER_OCT = "2026-11-01";

test("공휴일은 평일이어도 근무일이 아니다", () => {
  assert.equal(isWorkday("2026-10-09", "12345", holidays), false);
  assert.equal(isWorkday("2026-10-08", "12345", holidays), true);
});

test("공휴일에 인증하지 않아도 미출근·벌금이 붙지 않는다", () => {
  const s = memberMonthStats(group, member, "2026-10", AFTER_OCT, [], [], [], holidays);
  const day = s.days.find((x) => x.date === "2026-10-09")!;
  assert.equal(day.status, "restDay");
  assert.equal(day.fine, 0);
  assert.equal(s.absentCount, 20);
  assert.equal(s.workdayCount, 20);
  assert.equal(s.totalFine, 20 * 5000);
});

test("공휴일에 등록해 둔 휴가는 휴가 횟수로 세지 않는다", () => {
  const absence: Absence = {
    id: "a1",
    member_id: "m1",
    work_date: "2026-10-09",
    reason: "휴가",
    created_at: "2026-10-01T00:00:00Z",
  };
  const s = memberMonthStats(group, member, "2026-10", AFTER_OCT, [], [absence], [], holidays);
  assert.equal(s.excusedCount, 0);
});

test("날짜 기록에 공휴일 이름이 담긴다", () => {
  const s = memberMonthStats(group, member, "2026-10", AFTER_OCT, [], [], [], holidays);
  assert.equal(s.days.find((x) => x.date === "2026-10-09")!.holiday, "한글날");
  assert.equal(s.days.find((x) => x.date === "2026-10-08")!.holiday, undefined);
});
