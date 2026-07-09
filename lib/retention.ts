// 사진 보관 정책 — 오래된 사진 파일만 지우고 출근 기록·통계는 영구 보존.
// 별도 크론 없이 체크인 때마다 그룹당 하루 1회 지연 정리(lazy cleanup)로 동작한다.
import type { DB } from "./db";

const DEFAULT_RETENTION_MONTHS = 6;

function retentionMonths(): number {
  const v = parseInt(process.env.PHOTO_RETENTION_MONTHS ?? "", 10);
  return Number.isInteger(v) && v >= 1 && v <= 60 ? v : DEFAULT_RETENTION_MONTHS;
}

/** todayStr(YYYY-MM-DD)에서 n개월 전 날짜 */
export function monthsBefore(todayStr: string, n: number): string {
  const [y, m, d] = todayStr.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1 - n, Math.min(d, 28)));
  return dt.toISOString().slice(0, 10);
}

// 그룹별로 오늘 이미 정리를 돌렸는지 기억 (서버리스 인스턴스별 best-effort)
const g = globalThis as unknown as { __kungyaPurgeMark?: Map<string, string> };
function marks(): Map<string, string> {
  if (!g.__kungyaPurgeMark) g.__kungyaPurgeMark = new Map();
  return g.__kungyaPurgeMark;
}

/** 하루 1회, 보관 기간이 지난 사진 파일을 정리. 실패해도 체크인에는 영향 없음. */
export async function purgeOldPhotosOnce(
  db: DB,
  groupId: string,
  todayStr: string
): Promise<void> {
  if (marks().get(groupId) === todayStr) return;
  marks().set(groupId, todayStr);
  try {
    const cutoff = monthsBefore(todayStr, retentionMonths());
    await db.purgeOldPhotos(groupId, cutoff);
  } catch {
    // 정리 실패는 무시 — 다음 기회에 다시 시도
    marks().delete(groupId);
  }
}
