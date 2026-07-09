"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AVATAR_INFO } from "@/lib/types";
import KungyaFace from "@/components/KungyaFace";

type Mode = "login" | "signup" | "reset";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OPERATOR_EMAIL = process.env.NEXT_PUBLIC_OPERATOR_EMAIL || "";

const linkBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: "inherit",
  textDecoration: "underline",
  cursor: "pointer",
  font: "inherit",
};

export default function AuthForms() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [avatar, setAvatar] = useState("onion");
  const [busy, setBusy] = useState(false);

  function switchMode(m: Mode) {
    setMode(m);
    setError("");
    setPin("");
    setPinConfirm("");
    setResetCode("");
  }

  async function submit() {
    setError("");
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
      const endpoint =
        mode === "login" ? "/api/login" : mode === "signup" ? "/api/signup" : "/api/reset-pin";
      const payload =
        mode === "login"
          ? { email, pin }
          : mode === "signup"
            ? { username, email, pin, pinConfirm, avatar }
            : { email, code: resetCode, newPin: pin, newPinConfirm: pinConfirm };
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
      // 가입 직후엔 그룹이 없으므로 그룹 화면으로. 재설정 성공 시엔 자동 로그인.
      router.push(mode === "signup" ? "/groups" : "/dashboard");
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  }

  const operatorMailto = OPERATOR_EMAIL
    ? `mailto:${OPERATOR_EMAIL}?subject=${encodeURIComponent(
        "[쿵야출근단] PIN 재설정 요청"
      )}&body=${encodeURIComponent(
        `PIN 재설정을 요청합니다.\n가입 이메일: ${email.trim() || "(여기에 가입한 이메일을 적어주세요)"}\n닉네임: `
      )}`
    : "";

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

      {mode === "reset" && (
        <p className="muted" style={{ marginTop: 0 }}>
          그룹 관리자에게 <b>임시 코드(6자리)</b>를 요청한 뒤 아래에 입력하세요. 관리자는
          설정 → 그룹 설정에서 발급할 수 있어요.
        </p>
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
        />
      </label>

      {mode === "reset" && (
        <label className="field">
          임시 코드 (관리자에게 받은 6자리)
          <input
            value={resetCode}
            onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ""))}
            placeholder="예: 123456"
            inputMode="numeric"
            maxLength={6}
          />
        </label>
      )}

      <label className="field">
        {mode === "reset" ? "새 PIN (숫자 4~6자리)" : "PIN (숫자 4~6자리)"}
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

      {mode !== "login" && (
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

      <button className="btn big" onClick={submit} disabled={busy}>
        {busy ? "처리 중…" : mode === "login" ? "로그인" : mode === "signup" ? "가입하기" : "PIN 재설정하기"}
      </button>

      {mode === "login" && (
        <p className="muted" style={{ marginTop: 10, textAlign: "center" }}>
          <button type="button" onClick={() => switchMode("reset")} style={linkBtnStyle}>
            PIN을 잊으셨나요?
          </button>
        </p>
      )}

      {mode === "reset" && (
        <>
          <p className="muted" style={{ marginTop: 12 }}>
            관리자가 없거나 관리자도 PIN을 잊었다면 운영자에게 문의하세요.
            {OPERATOR_EMAIL ? (
              <>
                {" "}
                <a href={operatorMailto} style={{ color: "inherit" }}>
                  운영자에게 메일 보내기 ✉️
                </a>{" "}
                (가입한 이메일 주소를 꼭 적어주세요)
              </>
            ) : (
              " 운영자 이메일은 그룹 공지를 확인해 주세요."
            )}
          </p>
          <p className="muted" style={{ marginTop: 6, textAlign: "center" }}>
            <button type="button" onClick={() => switchMode("login")} style={linkBtnStyle}>
              ← 로그인으로 돌아가기
            </button>
          </p>
        </>
      )}

      {mode === "signup" && (
        <p className="muted" style={{ marginTop: 10 }}>
          이메일은 로그인 아이디로만 쓰여요. 가입 후 그룹을 만들거나 초대코드로 참여할 수
          있어요!
        </p>
      )}
    </div>
  );
}
