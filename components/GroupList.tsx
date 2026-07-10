"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface GroupListItem {
  groupId: string;
  name: string;
  isAdmin: boolean;
  scheduledTime: string;
  checkedCount: number;
  memberCount: number;
  myBadge: { cls: string; label: string };
}

// 홈 화면의 내 그룹 목록 — 누르면 현재 그룹을 그 그룹으로 바꾸고 "오늘" 탭으로 이동.
// 오늘·통계·설정 탭이 모두 선택한 그룹 기준으로 동작하게 된다.
export default function GroupList({ groups }: { groups: GroupListItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function open(groupId: string) {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/switch-group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId }),
      });
    } catch {
      // 쿠키 전환에 실패해도 오늘 탭은 기존 그룹 기준으로 열린다
    }
    router.push("/today");
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="card">
      <h2>내 그룹 🏟️</h2>
      {groups.map((g) => (
        <button key={g.groupId} className="member-row group-link" onClick={() => open(g.groupId)}>
          <div className="who">
            <div className="nm">
              {g.name}
              {g.isAdmin && " 👑"}
            </div>
            <div className="sub">
              기준 {g.scheduledTime} · {g.checkedCount}/{g.memberCount} 출근
            </div>
          </div>
          <span className={`badge ${g.myBadge.cls}`}>{g.myBadge.label}</span>
          <span className="chev">›</span>
        </button>
      ))}
    </div>
  );
}
