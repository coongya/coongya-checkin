"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface GroupItem {
  groupId: string;
  name: string;
  inviteCode: string;
  scheduledTime: string;
  isAdmin: boolean;
  isCurrent: boolean;
}

export default function GroupsClient({ groups }: { groups: GroupItem[] }) {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");
  const [joinTime, setJoinTime] = useState("09:00");
  const [groupName, setGroupName] = useState("");
  const [createTime, setCreateTime] = useState("09:00");
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

  async function switchTo(groupId: string) {
    const data = await post("/api/switch-group", { groupId });
    if (data) router.push("/dashboard");
  }

  async function join() {
    const data = await post("/api/join", { inviteCode, scheduledTime: joinTime });
    if (data) {
      setInviteCode("");
      router.push("/dashboard");
    }
  }

  async function create() {
    const data = await post("/api/groups", { groupName, scheduledTime: createTime });
    if (data) {
      setGroupName("");
      router.push("/dashboard");
    }
  }

  return (
    <>
      <div className="card">
        <h2>내 그룹 🏟️</h2>
        {groups.length === 0 && (
          <p className="muted">
            아직 참여한 그룹이 없어요. 아래에서 그룹을 만들거나 초대코드로 참여해 보세요!
          </p>
        )}
        {groups.map((g) => (
          <div className="member-row" key={g.groupId}>
            <div className="who">
              <div className="nm">
                {g.name}
                {g.isAdmin && " 👑"}
                {g.isCurrent && (
                  <span className="badge onTime" style={{ marginLeft: 6 }}>
                    보는 중
                  </span>
                )}
              </div>
              <div className="sub">
                기준 {g.scheduledTime} · 초대코드 {g.inviteCode}
              </div>
            </div>
            {!g.isCurrent && (
              <button className="btn small ghost" onClick={() => switchTo(g.groupId)} disabled={busy}>
                이 그룹 보기
              </button>
            )}
          </div>
        ))}
      </div>

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
        <button className="btn" onClick={create} disabled={busy || !groupName.trim()}>
          만들기
        </button>
      </div>

      {msg && <div className={msg.ok ? "ok-msg" : "error-msg"}>{msg.text}</div>}
    </>
  );
}
