import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { kstParts } from "@/lib/time";
import { fetchYearHolidays, holidayApiKey, syncHolidays } from "@/lib/holidays";

export const dynamic = "force-dynamic";

// 공휴일 동기화 크론 — 하루 한 번 호출 (vercel.json의 crons).
// 올해와 내년 공휴일을 특일정보 API에서 받아 DB를 갱신한다. 임시공휴일이 새로
// 지정되면 다음 실행 때 반영된다. ?year=2025 로 특정 연도만 수동 동기화할 수 있다.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const got =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    req.nextUrl.searchParams.get("secret") ??
    "";
  if (!secret || got !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const key = holidayApiKey();
  if (!key) return NextResponse.json({ ok: true, results: [], reason: "no-api-key" });

  const yearParam = req.nextUrl.searchParams.get("year") ?? "";
  const thisYear = parseInt(kstParts().date.slice(0, 4), 10);
  const years = /^\d{4}$/.test(yearParam) ? [parseInt(yearParam, 10)] : [thisYear, thisYear + 1];

  const results = await syncHolidays(await db(), years, (year) => fetchYearHolidays(year, key));
  for (const r of results) {
    if (r.status !== "updated") {
      console.error(`[holidays] ${r.year} 동기화 ${r.status}: ${r.reason ?? ""}`);
    }
  }
  return NextResponse.json({ ok: results.every((r) => r.status !== "failed"), results });
}
