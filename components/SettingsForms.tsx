"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AVATAR_INFO } from "@/lib/types";
import type { Absence, ScheduleOverride } from "@/lib/types";
import KungyaFace from "@/components/KungyaFace";

const DOW = [
  { n: "1", label: "월" },
  { n: "2", label: "화" },
  { n: "3", label: "수" },
  { n: "4", label: "목" },
  { n: "5", label: "금" },
  { n: "6", label: "토" },
  { n: "7", label: "일" },
];

async function patchJson(url: string, method: string, body: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return data.error || "오류가 발생했어요.";
    }
    return null;
  } catch {
    return "네트워크 오류가 발생했어요.";
  }
}

export function MemberSettings(props: {
  scheduledTime: string;
  workdays: string;
  avatar: string;
  username: string;
}) {
  const router = useRouter();
  const [time, setTime] = useState(props.scheduledTime);
  const [workdays, setWorkdays] = useState(props.workdays);
  const [avatar, setAvatar] = useState(props.avatar);
  const [username, setUsername] = useState(props.username);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleDay(n: string) {
    setWorkdays((prev) => {
      const set = new Set(prev.split(""));
      if (set.has(n)) set.delete(n);
      else set.add(n);
      return [...set].sort().join("");
    });
  }

  async function save() {
    if (!workdays) {
      setMsg({ ok: false, text: "근무 요일을 하나 이상 선택해 주세요." });
      return;
    }
    if (username.trim().length < 2) {
      setMsg({ ok: false, text: "닉네임은 2~20자로 입력해 주세요." });
      return;
    }
    setBusy(true);
    const err = await patchJson("/api/member", "PATCH", {
      scheduledTime: time,
      workdays,
      avatar,
      username,
    });
    setBusy(false);
    setMsg(err ? { ok: false, text: err } : { ok: true, text: "저장했어요! 🎉" });
    if (!err) router.refresh();
  }

  return (
    <div className="card">
      <h2>내 설정 🧅</h2>
      <label className="field">
        닉네임 (2~20자 · 모든 그룹에 적용)
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="예: 클레어"
          maxLength={20}
        />
      </label>
      <label className="field">
        기준 출근 시각
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </label>
      <span className="field" style={{ marginBottom: 4 }}>
        근무 요일
      </span>
      <div className="avatar-grid">
        {DOW.map((d) => (
          <button
            key={d.n}
            type="button"
            className={workdays.includes(d.n) ? "on" : ""}
            style={{ fontSize: 15, fontWeight: 700 }}
            onClick={() => toggleDay(d.n)}
          >
            {d.label}
          </button>
        ))}
      </div>
      <span className="field" style={{ marginBottom: 4 }}>
        쿵야 캐릭터
      </span>
      <div className="avatar-grid">
        {Object.entries(AVATAR_INFO).map(([key, info]) => (
          <button
            key={key}
            type="button"
            className={`pick ${avatar === key ? "on" : ""}`}
            onClick={() => setAvatar(key)}
          >
            <KungyaFace avatar={key} />
            <span className="lbl">{info.label}</span>
          </button>
        ))}
      </div>
      {msg && <div className={msg.ok ? "ok-msg" : "error-msg"}>{msg.text}</div>}
      <button className="btn" onClick={save} disabled={busy}>
        저장하기
      </button>
    </div>
  );
}

export function AbsenceManager({ absences }: { absences: Absence[] }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("휴가");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!date) {
      setMsg({ ok: false, text: "날짜를 선택해 주세요." });
      return;
    }
    setBusy(true);
    const err = await patchJson("/api/absence", "POST", { date, reason });
    setBusy(false);
    setMsg(err ? { ok: false, text: err } : { ok: true, text: "등록했어요! 해당 날짜는 벌금이 면제돼요 🏠" });
    if (!err) {
      setDate("");
      router.refresh();
    }
  }

  async function remove(d: string) {
    setBusy(true);
    const err = await patchJson("/api/absence", "DELETE", { date: d });
    setBusy(false);
    if (err) setMsg({ ok: false, text: err });
    else router.refresh();
  }

  return (
    <div className="card">
      <h2>휴가 / 미출근 사유 등록 🏠</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        휴가·연차·출장 등으로 출근 인증을 못 하는 날을 등록하면 벌금이 면제돼요.
      </p>
      <label className="field">
        날짜
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field">
        사유
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          <option>휴가</option>
          <option>재택</option>
          <option>교육</option>
          <option>아파요</option>
          <option>출장</option>
        </select>
      </label>
      {msg && <div className={msg.ok ? "ok-msg" : "error-msg"}>{msg.text}</div>}
      <button className="btn" onClick={add} disabled={busy}>
        등록하기
      </button>

      {absences.length > 0 && (
        <>
          <hr className="divider" />
          <h3>등록된 날짜</h3>
          {absences.map((a) => (
            <div className="member-row" key={a.id}>
              <div className="who">
                <div className="nm">{a.work_date}</div>
                <div className="sub">{a.reason}</div>
              </div>
              <button className="btn small danger" onClick={() => remove(a.work_date)} disabled={busy}>
                삭제
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export function PinChange() {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const err = await patchJson("/api/member", "PATCH", { currentPin, newPin });
    setBusy(false);
    setMsg(err ? { ok: false, text: err } : { ok: true, text: "PIN을 바꿨어요! 🔒" });
    if (!err) {
      setCurrentPin("");
      setNewPin("");
    }
  }

  return (
    <div className="card">
      <h2>PIN 변경 🔒</h2>
      <label className="field">
        현재 PIN
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={currentPin}
          onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
        />
      </label>
      <label className="field">
        새 PIN (숫자 4~6자리)
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={newPin}
          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
        />
      </label>
      {msg && <div className={msg.ok ? "ok-msg" : "error-msg"}>{msg.text}</div>}
      <button className="btn" onClick={save} disabled={busy || !currentPin || !newPin}>
        변경하기
      </button>
    </div>
  );
}

export function OverrideManager({
  overrides,
  defaultTime,
}: {
  overrides: ScheduleOverride[];
  defaultTime: string;
}) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [time, setTime] = useState(defaultTime);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!date) {
      setMsg({ ok: false, text: "날짜를 선택해 주세요." });
      return;
    }
    setBusy(true);
    const err = await patchJson("/api/override", "POST", { date, time });
    setBusy(false);
    setMsg(
      err
        ? { ok: false, text: err }
        : { ok: true, text: `${date}의 기준 시각을 ${time}로 바꿨어요 ⏰` }
    );
    if (!err) {
      setDate("");
      router.refresh();
    }
  }

  async function remove(d: string) {
    setBusy(true);
    const err = await patchJson("/api/override", "DELETE", { date: d });
    setBusy(false);
    if (err) setMsg({ ok: false, text: err });
    else router.refresh();
  }

  return (
    <div className="card">
      <h2>특정 날짜 기준 시각 변경 ⏰</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        병원·오후 출근 등으로 특정 날짜만 기준 출근 시각이 다를 때 등록해요. 그날의 지각
        판정은 여기 등록한 시각으로 해요. (지난 날짜·이미 인증한 날은 변경 불가)
      </p>
      <label className="field">
        날짜
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field">
        그날의 기준 출근 시각
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </label>
      {msg && <div className={msg.ok ? "ok-msg" : "error-msg"}>{msg.text}</div>}
      <button className="btn" onClick={add} disabled={busy}>
        등록하기
      </button>

      {overrides.length > 0 && (
        <>
          <hr className="divider" />
          <h3>등록된 날짜</h3>
          {overrides.map((o) => (
            <div className="member-row" key={o.id}>
              <div className="who">
                <div className="nm">{o.work_date}</div>
                <div className="sub">기준 {o.scheduled_time} (기본 {defaultTime})</div>
              </div>
              <button
                className="btn small danger"
                onClick={() => remove(o.work_date)}
                disabled={busy}
              >
                삭제
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export function GroupSettings(props: {
  isAdmin: boolean;
  fineLate: number;
  fineAbsent: number;
  inviteCode: string;
  groupName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(props.groupName);
  const [fineLate, setFineLate] = useState(String(props.fineLate));
  const [fineAbsent, setFineAbsent] = useState(String(props.fineAbsent));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) {
      setMsg({ ok: false, text: "그룹 이름을 입력해 주세요." });
      return;
    }
    setBusy(true);
    const err = await patchJson("/api/group", "PATCH", {
      name,
      fineLate: Number(fineLate),
      fineAbsent: Number(fineAbsent),
    });
    setBusy(false);
    setMsg(err ? { ok: false, text: err } : { ok: true, text: "저장했어요! 🎉" });
    if (!err) router.refresh();
  }

  async function removeGroup() {
    const sure = confirm(
      `정말 "${props.groupName}" 그룹을 삭제할까요?\n\n멤버·출근 기록·사진 등 그룹의 모든 데이터가 삭제되고 되돌릴 수 없어요.`
    );
    if (!sure) return;
    setBusy(true);
    const err = await patchJson("/api/group", "DELETE", {});
    setBusy(false);
    if (err) setMsg({ ok: false, text: err });
    else {
      router.push("/groups");
      router.refresh();
    }
  }

  async function leaveGroup() {
    const sure = confirm(
      `"${props.groupName}" 그룹에서 나갈까요?\n\n지금까지의 기록은 남지만, 나간 뒤에는 그룹 화면·집계·랭킹에서 제외돼요.`
    );
    if (!sure) return;
    setBusy(true);
    const err = await patchJson("/api/leave", "POST", {});
    setBusy(false);
    if (err) setMsg({ ok: false, text: err });
    else {
      router.push("/groups");
      router.refresh();
    }
  }

  return (
    <div className="card">
      <h2>그룹 설정 ⚙️</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        그룹: <b>{props.groupName}</b> · 초대코드{" "}
        <span className="invite-chip" style={{ fontSize: 14, padding: "4px 10px" }}>
          {props.inviteCode}
        </span>
      </p>
      {props.isAdmin ? (
        <>
          <label className="field">
            그룹 이름
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
            />
          </label>
          <label className="field">
            지각 벌금 (원)
            <input
              type="number"
              min={0}
              step={1000}
              value={fineLate}
              onChange={(e) => setFineLate(e.target.value)}
            />
          </label>
          <label className="field">
            무단 미출근 벌금 (원)
            <input
              type="number"
              min={0}
              step={1000}
              value={fineAbsent}
              onChange={(e) => setFineAbsent(e.target.value)}
            />
          </label>
          {msg && <div className={msg.ok ? "ok-msg" : "error-msg"}>{msg.text}</div>}
          <button className="btn" onClick={save} disabled={busy}>
            저장하기
          </button>
        </>
      ) : (
        <>
          {msg && <div className={msg.ok ? "ok-msg" : "error-msg"}>{msg.text}</div>}
          <p className="muted">그룹 이름·벌금 설정은 그룹 관리자만 변경할 수 있어요.</p>
        </>
      )}

      <hr className="divider" />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn small danger" onClick={leaveGroup} disabled={busy}>
          그룹 나가기 👋
        </button>
        {props.isAdmin && (
          <button className="btn small danger" onClick={removeGroup} disabled={busy}>
            그룹 삭제하기 🗑️
          </button>
        )}
      </div>
      <p className="muted" style={{ marginBottom: 0 }}>
        나가면 기록은 남지만 집계에서 제외돼요. 삭제하면 그룹의 모든 데이터가 사라져요.
      </p>
    </div>
  );
}
