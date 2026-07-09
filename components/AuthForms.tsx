"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AVATAR_INFO } from "@/lib/types";
import KungyaFace from "@/components/KungyaFace";

type Mode = "login" | "signup" | "reset";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function postJson(url: string, payload: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: data.error || "오류가 발생했어요." };
  } catch {
    return { ok: false, error: "네트워크 오류가 발생했어요." };
  }
}

export default function AuthForms() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [avatar, setAvatar] = useState("onion");
  const [busy, setBusy] = useState(false);
  // PIN 재설정: 코드 발송 후 입력 단계
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [resetCode, setResetCode] = useState("");

  function switchMode(m: Mode) {
    setMode(m);
    setError("");
    setInfo("");
    setPin("");
    setPinConfirm("");
    setResetCode("");
    setResetCodeSent(false);
  }

  async function submit() {
    setError("");
    setInfo("");
    if (!EMAIL_RE.test(email.trim())) {
      setError("이메일 주소 형식을 확인해 주세요.");
      return;
    }
    if (mode === "signup" && username.trim().length < 2) {
      setError("닉네임은 2~20자로 입력해 주세요.");
      return;
    }
    if (mode !== "login" && pin !== pinConfirm) {
      setError("PIN과 PIN 확인이 일치하지 않아요.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        const r = await postJson("/api/login", { email, pin });
        if (!r.ok) return setError(r.error!);
        router.push("/dashboard");
      } else if (mode === "signup") {
        const r = await postJson("/api/signup", { username, email, pin, pinConfirm, avatar });
        if (!r.ok) return setError(r.error!);
        router.push("/groups");
      } else if (!resetCodeSent) {
        // 재설정 1단계: 인증 코드 발송
        const r = await postJson("/api/reset-pin/request", { email });
        if (!r.ok) return setError(r.error!);
        setResetCodeSent(true);
        setInfo("가입된 이메일이면 인증 코드를 보냈어요. 10분 안에 입력해 주세요. 📬");
      } else {
        // 재설정 2단계: 코드 확인 + 새 PIN 저장 (성공 시 자동 로그인)
        const r = await postJson("/api/reset-pin/confirm", {
          email,
          code: resetCode,
          newPin: pin,
          newPinConfirm: pinConfirm,
        });
        if (!r.ok) return setError(r.error!);
        router.push("/dashboard");
      }
    } finally {
      setBusy(false);
    }
  }

  const pinLabel = mode === "reset" ? "새 PIN (숫자 4~6자리)" : "PIN (숫자 4~6자리)";
  const submitLabel = busy
    ? "처리 중…"
    : mode === "login"
      ? "로그인"
      : mode === "signup"
        ? "가입하기"
        : resetCodeSent
          ? "PIN 재설정하기"
          : "인증 코드 받기";

  return (
    <div className="card">
      {mode !== "reset" ? (
        <div className="mode-tabs">
          <button className={mode === "login" ? "on" : ""} onClick={() => switchMode("login")}>
            로그인
          </button>
          <button className={mode === "signup" ? "on" : ""} onClick={() => switchMode("signup")}>
            회원가입
          </button>
        </div>
      ) : (
        <h2 style={{ marginTop: 0 }}>PIN 재설정 🔑</h2>
      )}

      {mode === "signup" && (
        <label className="field">
          닉네임 (2~20자)
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="예: 클레어"
            maxLength={20}
          />
        </label>
      )}

      <label className="field">
        이메일
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="예: kungya@example.com"
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={254}
          disabled={mode === "reset" && resetCodeSent}
        />
      </label>

      {mode === "reset" && resetCodeSent && (
        <label className="field">
          인증 코드 (6자리)
          <input
            value={resetCode}
            onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ""))}
            placeholder="이메일로 받은 숫자 6자리"
            inputMode="numeric"
            maxLength={6}
          />
        </label>
      )}

      {(mode !== "reset" || resetCodeSent) && (
        <label className="field">
          {pinLabel}
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="비밀번호 대신 쓰는 간단한 숫자"
            inputMode="numeric"
            type="password"
            maxLength={6}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </label>
      )}

      {((mode === "signup") || (mode === "reset" && resetCodeSent)) && (
        <label className="field">
          PIN 확인 (한 번 더 입력)
          <input
            value={pinConfirm}
            onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ""))}
            placeholder="같은 PIN을 다시 입력해 주세요"
            inputMode="numeric"
            type="password"
            maxLength={6}
            autoComplete="new-password"
          />
        </label>
      )}

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
      {info && <div className="ok-msg">{info}</div>}

      <button className="btn big" onClick={submit} disabled={busy}>
        {submitLabel}
      </button>

      {mode === "login" && (
        <p className="muted" style={{ marginTop: 10, textAlign: "center" }}>
          <button
            type="button"
            onClick={() => switchMode("reset")}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "inherit",
              textDecoration: "underline",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            PIN을 잊으셨나요?
          </button>
        </p>
      )}

      {mode === "reset" && (
        <p className="muted" style={{ marginTop: 10, textAlign: "center" }}>
          <button
            type="button"
            onClick={() => switchMode("login")}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "inherit",
              textDecoration: "underline",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            ← 로그인으로 돌아가기
          </button>
        </p>
      )}

      {mode === "signup" && (
        <p className="muted" style={{ marginTop: 10 }}>
          이메일은 로그인 아이디와 PIN 재설정에만 쓰여요. 가입 후 그룹을 만들거나
          초대코드로 참여할 수 있어요!
        </p>
      )}
    </div>
  );
}
