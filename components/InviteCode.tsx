"use client";

import { useRef, useState } from "react";

// 초대코드 칩 — 누르면 클립보드에 복사된다
export default function InviteCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // 클립보드 API를 못 쓰는 환경(비HTTPS 등) 폴백
      const ta = document.createElement("textarea");
      ta.value = code;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      className="invite-chip"
      onClick={copy}
      title="누르면 복사돼요"
      style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}
    >
      {copied ? "복사됐어요! ✅" : `${code} 📋`}
    </button>
  );
}
