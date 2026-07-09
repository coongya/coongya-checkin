"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AVATAR_INFO } from "@/lib/types";
import KungyaFace from "@/components/KungyaFace";

type Mode = "login" | "join" | "create";

export default function AuthForms() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [groupName, setGroupName] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [avatar, setAvatar] = useState("onion");
  const [busy, setBusy] = useState(false);
  const [createdCode, setCreatedCode] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const endpoint =
        mode === "login" ? "/api/login" : mode === "join" ? "/api/join" : "/api/groups";
      const payload =
        mode === "login"
          ? { inviteCode, name, pin }
          : mode === "join"
            ? { inviteCode, name, pin, scheduledTime, avatar }
            : { groupName, name, pin, scheduledTime, avatar };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "오류가 발생했어요.");
        return;
      }
      if (mode === "create" && data.inviteCode) {
        setCreatedCode(data.inviteCode);
        setTimeout(() => router.push("/dashboard"), 2500);
        return;
      }
      router.push("/dashboard");
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  }

  if (createdCode) {
    return (
      <div className="card" style={{ textAlign: "center" }}>
        <h2>그룹이 만들어졌어요! 🎉</h2>
        <p className="muted">쿵야들에게 이 초대코드를 공유해 주세요.</p>
        <div className="invite-chip" style={{ margin: "10px 0" }}>
          {createdCode}
        </div>
        <p className="muted">잠시 후 대시보드로 이동해요…</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="mode-tabs">
        <button className={mode === "login" ? "on" : ""} onClick={() => setMode("login")}>
          로그인
        </button>
        <button className={mode === "join" ? "on" : ""} onClick={() => setMode("join")}>
          그룹 참여
        </button>
        <button className={mode === "create" ? "on" : ""} onClick={() => setMode("create")}>
          그룹 만들기
        </button>
      </div>

      {mode === "create" ? (
        <label className="field">
          그룹 이름
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="예: 야채부락리 출근단"
            maxLength={30}
          />
        </label>
      ) : (
        <label className="field">
          초대코드
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            placeholder="예: KUNG3A"
            maxLength={6}
            style={{ textTransform: "uppercase", letterSpacing: "0.2em" }}
          />
        </label>
      )}

      <label className="field">
        닉네임
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 클레어"
          maxLength={20}
        />
      </label>

      <label className="field">
        PIN (숫자 4~6자리)
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="비밀번호 대신 쓰는 간단한 숫자"
          inputMode="numeric"
          type="password"
          maxLength={6}
        />
      </label>

      {mode !== "login" && (
        <>
          <label className="field">
            나의 기준 출근 시각 (이 시각 이후 인증하면 지각!)
            <input
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
            />
          </label>
          <div>
            <span className="field" style={{ marginBottom: 0 }}>
              나의 쿵야 캐릭터
            </span>
            <div className="avatar-grid">
              {Object.entries(AVATAR_INFO).map(([key, info]) => (
                <button
                  key={key}
                  type="button"
                  className={`pick ${avatar === key ? "on" : ""}`}
                  onClick={() => setAvatar(key)}
                  aria-label={info.label}
                >
                  <KungyaFace avatar={key} />
                  <span className="lbl">{info.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {error && <div className="error-msg">{error}</div>}

      <button className="btn big" onClick={submit} disabled={busy}>
        {busy
          ? "처리 중…"
          : mode === "login"
            ? "로그인"
            : mode === "join"
              ? "그룹 참여"
              : "그룹 만들기"}
      </button>

      {mode !== "login" && (
        <p className="muted" style={{ marginTop: 10 }}>
          기본 근무일은 평일(월~금)이에요. 참여 후 설정에서 바꿀 수 있어요.
        </p>
      )}
    </div>
  );
}
