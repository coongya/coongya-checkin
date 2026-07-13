"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 오늘 날짜 (KST, YYYY-MM-DD) — 시작일 입력의 기본값
function todayKST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

export default function GroupsClient() {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");
  const [joinTime, setJoinTime] = useState("09:00");
  const [groupName, setGroupName] = useState("");
  const [createTime, setCreateTime] = useState("09:00");
  const [startDate, setStartDate] = useState(todayKST());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(url: string, payload: unknown): Promise<Record<string, unknown> | null> {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error || "오류가 발생했어요." });
        return null;
      }
      return data;
    } catch {
      setMsg({ ok: false, text: "네트워크 오류가 발생했어요." });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    const data = await post("/api/join", { inviteCode, scheduledTime: joinTime });
    if (data) {
      setInviteCode("");
      router.push("/dashboard");
    }
  }

  async function create() {
    const data = await post("/api/groups", { groupName, scheduledTime: createTime, startDate });
    if (data) {
      setGroupName("");
      router.push("/dashboard");
    }
  }

  return (
    <>
      <div className="card">
        <h2>초대코드로 참여 🎟️</h2>
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
        <label className="field">
          이 그룹에서 나의 기준 출근 시각
          <input type="time" value={joinTime} onChange={(e) => setJoinTime(e.target.value)} />
        </label>
        <button className="btn" onClick={join} disabled={busy || !inviteCode}>
          참여하기
        </button>
      </div>

      <div className="card">
        <h2>새 그룹 만들기 ✨</h2>
        <label className="field">
          그룹 이름
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="예: 카공출근단"
            maxLength={30}
          />
        </label>
        <label className="field">
          이 그룹에서 나의 기준 출근 시각
          <input type="time" value={createTime} onChange={(e) => setCreateTime(e.target.value)} />
        </label>
        <label className="field">
          기록 시작일
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <p className="muted" style={{ marginTop: 0 }}>
          이 날짜부터 출근 기록과 벌금 판정이 시작돼요. 그 전 날짜는 미출근으로 치지
          않아요. (나중에 그룹 설정에서 바꿀 수 있어요)
        </p>
        <button className="btn" onClick={create} disabled={busy || !groupName.trim() || !startDate}>
          만들기
        </button>
      </div>

      {msg && <div className={msg.ok ? "ok-msg" : "error-msg"}>{msg.text}</div>}
    </>
  );
}
