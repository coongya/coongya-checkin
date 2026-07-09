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

// 오늘 화면의 내 그룹 목록 — 누르면 그 그룹의 오늘 현황 화면으로 이동한다.
// 이동 전에 현재 그룹 쿠키를 바꿔서 통계·설정 탭도 그 그룹 기준이 되게 한다.
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
      // 쿠키 전환 실패해도 상세 화면 자체는 볼 수 있으므로 계속 진행
    }
    router.push(`/group/${groupId}`);
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
