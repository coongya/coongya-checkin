// 간단한 인메모리 레이트 리미터 (서버리스 인스턴스별 best-effort)
// PIN(4~6자리) 무차별 대입을 늦추는 목적. 완전한 방어가 아니라 감속 장치입니다.

interface Bucket {
  count: number;
  resetAt: number;
}

const g = globalThis as unknown as { __kungyaRate?: Map<string, Bucket> };

function buckets(): Map<string, Bucket> {
  if (!g.__kungyaRate) g.__kungyaRate = new Map();
  return g.__kungyaRate;
}

/** windowMs 동안 key당 max회까지 허용. 초과 시 false. */
export function allowRequest(key: string, max = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const map = buckets();
  // 청소 (맵 무한 성장 방지)
  if (map.size > 5000) {
    for (const [k, b] of map) if (b.resetAt < now) map.delete(k);
  }
  const b = map.get(key);
  if (!b || b.resetAt < now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count++;
  return b.count <= max;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "local";
}
