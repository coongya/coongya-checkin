"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AVATAR_INFO } from "@/lib/types";
import KungyaFace from "@/components/KungyaFace";

type Mode = "login" | "signup";

export default function AuthForms() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [avatar, setAvatar] = useState("onion");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const endpoint = mode === "login" ? "/api/login" : "/api/signup";
      const payload =
        mode === "login" ? { username, pin } : { username, pin, avatar };
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
      // 가입 직후엔 그룹이 없으므로 그룹 화면으로
      router.push(mode === "signup" ? "/groups" : "/dashboard");
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="mode-tabs">
        <button className={mode === "login" ? "on" : ""} onClick={() => setMode("login")}>
          로그인
        </button>
        <button className={mode === "signup" ? "on" : ""} onClick={() => setMode("signup")}>
          회원가입
        </button>
      </div>

      <label className="field">
        닉네임
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
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

      {mode === "signup" && (
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
      )}

      {error && <div className="error-msg">{error}</div>}

      <button className="btn big" onClick={submit} disabled={busy}>
        {busy ? "처리 중…" : mode === "login" ? "로그인" : "가입하기"}
      </button>

      {mode === "signup" && (
        <p className="muted" style={{ marginTop: 10 }}>
          가입 후 그룹을 만들거나 초대코드로 참여할 수 있어요. 한 계정으로 여러 그룹에
          참여할 수 있어요!
        </p>
      )}
    </div>
  );
}
