"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { REMINDER_OFFSETS, parseReminders } from "@/lib/types";

// VAPID 공개키(base64url) → PushManager가 요구하는 Uint8Array
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const OFFSET_LABEL = (n: number) => (n === 60 ? "1시간 전" : `${n}분 전`);

type DeviceState =
  | "loading" // 확인 중
  | "unsupported" // 이 브라우저는 푸시 미지원 (iOS는 홈 화면 추가 필요)
  | "denied" // 알림 권한이 거부됨
  | "off" // 지원하지만 이 기기 구독 없음
  | "on"; // 이 기기에서 알림 받는 중

export default function NotificationSettings(props: {
  groupName: string;
  reminders: string;
  notifyCheckin: boolean;
  vapidPublicKey: string | null;
}) {
  const router = useRouter();
  const [device, setDevice] = useState<DeviceState>("loading");
  const [offsets, setOffsets] = useState<Set<number>>(new Set(parseReminders(props.reminders)));
  const [notifyCheckin, setNotifyCheckin] = useState(props.notifyCheckin);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setDevice("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setDevice("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        setDevice(sub ? "on" : "off");
      } catch {
        setDevice("unsupported");
      }
    })();
  }, []);

  async function enable() {
    if (!props.vapidPublicKey) {
      setMsg({ ok: false, text: "서버에 알림 설정(VAPID 키)이 아직 없어요." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setDevice(perm === "denied" ? "denied" : "off");
        setMsg({ ok: false, text: "알림 권한이 허용되지 않았어요." });
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(props.vapidPublicKey) as BufferSource,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "구독 저장에 실패했어요.");
      }
      setDevice("on");
      setMsg({ ok: true, text: "이 기기에서 알림을 받아요! 🔔" });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "알림 설정에 실패했어요." });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setDevice("off");
      setMsg({ ok: true, text: "이 기기의 알림을 껐어요." });
    } catch {
      setMsg({ ok: false, text: "알림 해제에 실패했어요." });
    } finally {
      setBusy(false);
    }
  }

  function toggleOffset(n: number) {
    setOffsets((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/member", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reminders: [...offsets].sort((a, b) => a - b).join(","),
          notifyCheckin,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "저장에 실패했어요.");
      }
      setMsg({ ok: true, text: "저장했어요! 🎉" });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "저장에 실패했어요." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>알림 🔔</h2>

      {device === "unsupported" && (
        <p className="muted" style={{ marginTop: 0 }}>
          이 브라우저에서는 푸시 알림을 쓸 수 없어요. 아이폰은 사파리에서{" "}
          <b>공유 → 홈 화면에 추가</b>로 설치한 앱에서만 알림이 돼요 (iOS 16.4 이상).
        </p>
      )}
      {device === "denied" && (
        <p className="muted" style={{ marginTop: 0 }}>
          알림 권한이 거부되어 있어요. 기기 설정에서 이 앱(사이트)의 알림을 허용한 뒤
          다시 시도해 주세요.
        </p>
      )}
      {(device === "off" || device === "on") && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span className="muted">
            {device === "on" ? "이 기기에서 알림을 받는 중이에요." : "이 기기는 알림이 꺼져 있어요."}
          </span>
          {device === "on" ? (
            <button className="btn small ghost" onClick={disable} disabled={busy}>
              알림 끄기
            </button>
          ) : (
            <button className="btn small" onClick={enable} disabled={busy}>
              이 기기에서 알림 받기
            </button>
          )}
        </div>
      )}

      <span className="field" style={{ marginBottom: 4 }}>
        출근 리마인더 — 기준 시각 몇 분 전에 알려줄까요? (복수 선택)
      </span>
      <div className="avatar-grid">
        {REMINDER_OFFSETS.map((n) => (
          <button
            key={n}
            type="button"
            className={offsets.has(n) ? "on" : ""}
            style={{ fontSize: 14, fontWeight: 700 }}
            onClick={() => toggleOffset(n)}
          >
            {OFFSET_LABEL(n)}
          </button>
        ))}
      </div>

      <label
        className="field"
        style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}
      >
        <input
          type="checkbox"
          checked={notifyCheckin}
          onChange={(e) => setNotifyCheckin(e.target.checked)}
          style={{ width: "auto" }}
        />
        {props.groupName} 멤버가 출석하면 알림 받기
      </label>

      <p className="muted" style={{ marginTop: 6 }}>
        리마인더와 출석 알림은 <b>{props.groupName}</b> 그룹 기준이에요. 이미 인증했거나
        휴가 등록한 날, 휴무일에는 리마인더가 오지 않아요.
      </p>
      {msg && <div className={msg.ok ? "ok-msg" : "error-msg"}>{msg.text}</div>}
      <button className="btn" onClick={save} disabled={busy}>
        저장하기
      </button>
    </div>
  );
}
