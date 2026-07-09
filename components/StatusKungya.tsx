"use client";

import { useState } from "react";
import KungyaFace from "@/components/KungyaFace";

export type CheckinStatus = "before" | "onTime" | "late" | "excused";

// 상태별 이미지 경로 — public/kungya/에 파일을 넣으면 자동으로 표시된다.
// 파일이 없으면 아바타(인증 전) 또는 이모지로 폴백.
const STATUS_IMG: Record<CheckinStatus, string> = {
  before: "/kungya/status-before.png",
  onTime: "/kungya/status-ontime.png",
  late: "/kungya/status-late.png",
  excused: "/kungya/status-vacation.png",
};

const STATUS_EMOJI: Record<CheckinStatus, string> = {
  before: "",
  onTime: "🥳",
  late: "😭",
  excused: "🏠",
};

export default function StatusKungya({
  status,
  avatar,
}: {
  status: CheckinStatus;
  avatar: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    // 이미지 파일이 아직 없을 때의 폴백
    return (
      <span className="status-fallback">
        {status === "before" ? <KungyaFace avatar={avatar} size={110} /> : STATUS_EMOJI[status]}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="status-img"
      src={STATUS_IMG[status]}
      alt=""
      onError={() => setFailed(true)}
    />
  );
}
