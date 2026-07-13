"use client";

import { useEffect } from "react";

// 앱 로드 시 서비스 워커 등록 — 권한 요청은 하지 않는다 (설정 화면의 버튼에서만)
export default function PushInit() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
