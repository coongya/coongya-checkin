// 웹 푸시 발송 — VAPID 키가 설정된 경우에만 동작 (없으면 조용히 건너뜀)
import webpush from "web-push";
import type { DB } from "./db";

export interface PushPayload {
  title: string;
  body: string;
  url: string; // 알림 탭 시 열 경로
  tag?: string; // 같은 tag의 알림은 하나로 합쳐짐
}

export function pushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
  );
}

let vapidReady = false;
function ensureVapid(): boolean {
  if (!pushConfigured()) return false;
  if (!vapidReady) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:noreply@example.com",
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );
    vapidReady = true;
  }
  return true;
}

/**
 * 여러 계정의 모든 기기로 푸시 발송. 만료된 구독(404/410)은 정리한다.
 * 실패해도 던지지 않는다 — 알림은 본 기능(출근 기록)을 막으면 안 되므로.
 */
export async function sendPushToUsers(
  d: DB,
  userIds: string[],
  payload: PushPayload
): Promise<number> {
  if (userIds.length === 0 || !ensureVapid()) return 0;
  let subs;
  try {
    subs = await d.listPushSubscriptionsByUsers(userIds);
  } catch (e) {
    console.error("[push] 구독 조회 실패:", e instanceof Error ? e.message : e);
    return 0;
  }
  const body = JSON.stringify(payload);
  let sent = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: 60 * 60 }
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          // 구독이 만료됨 (앱 삭제/브라우저 데이터 삭제) — 정리
          await d.deletePushSubscription(sub.user_id, sub.endpoint).catch(() => {});
        } else {
          console.error(`[push] 발송 실패(${code ?? "?"}):`, e instanceof Error ? e.message : e);
        }
      }
    })
  );
  return sent;
}
