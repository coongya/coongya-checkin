"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import StatusKungya, { type CheckinStatus } from "@/components/StatusKungya";

interface GroupOption {
  groupId: string;
  groupName: string;
  alreadyChecked: boolean;
}

interface Props {
  avatar: string;
  /** 오늘 나의 상태 — before(인증 전) / onTime(정시) / late(지각) / excused(휴가) */
  status: CheckinStatus;
  lateMinutes?: number;
  /** 인증 전일 때 남은 시간을 계산할 기준 시각 (HH:MM). 없으면 카운트다운 미표시 */
  countdownTo?: string | null;
  isWorkdayToday: boolean;
  groupOptions: GroupOption[]; // 참여 중인 모든 그룹 (멀티 인증용)
}

function nowKst(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
}

/** 기준 시각(HH:MM)까지 남은 시간 문자열. 지났으면 마이너스 상태로 반환 */
function remainingTo(target: string): { text: string; passed: boolean } {
  const now = nowKst();
  const [h, m] = target.split(":").map((x) => parseInt(x, 10));
  const due = new Date(now);
  due.setHours(h, m, 0, 0);
  let diff = Math.floor((due.getTime() - now.getTime()) / 1000);
  const passed = diff < 0;
  diff = Math.abs(diff);
  const hh = Math.floor(diff / 3600);
  const mm = Math.floor((diff % 3600) / 60);
  const ss = diff % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { text: `${pad(hh)}:${pad(mm)}:${pad(ss)}`, passed };
}

export default function CheckinCard(props: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [selected, setSelected] = useState<string[]>(
    props.groupOptions.filter((g) => !g.alreadyChecked).map((g) => g.groupId)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [countdown, setCountdown] = useState<{ text: string; passed: boolean } | null>(null);
  const [dateLabel, setDateLabel] = useState("");

  useEffect(() => {
    const tick = () => {
      setDateLabel(
        nowKst().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" })
      );
      setCountdown(props.countdownTo ? remainingTo(props.countdownTo) : null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [props.countdownTo]);

  // ⭐ 검은 화면 방지: 비디오 엘리먼트가 마운트된 "후에" 스트림을 연결한다.
  useEffect(() => {
    const v = videoRef.current;
    if (!showCamera || !stream || !v) return;
    v.srcObject = stream;
    const play = () => v.play().catch(() => {});
    play();
    v.addEventListener("loadedmetadata", play);
    return () => v.removeEventListener("loadedmetadata", play);
  }, [showCamera, stream]);

  const closeCamera = useCallback(() => {
    setStream((s) => {
      s?.getTracks().forEach((t) => t.stop());
      return null;
    });
    setShowCamera(false);
  }, []);

  // 페이지 이탈 시 카메라 정리
  useEffect(() => closeCamera, [closeCamera]);

  async function openCamera(nextFacing?: "user" | "environment") {
    const f = nextFacing ?? facing;
    try {
      stream?.getTracks().forEach((t) => t.stop());
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: f, width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false, // 오디오 미사용 → 셔터음 없음
      });
      setStream(s);
      setFacing(f);
      setShowCamera(true);
      setError("");
    } catch {
      // 권한 거부/미지원 → 기본 카메라 앱 폴백
      setShowCamera(false);
      fileRef.current?.click();
    }
  }

  function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    canvas.toBlob(
      (b) => {
        if (b) {
          const f = new File([b], "checkin.jpg", { type: "image/jpeg" });
          setFile(f);
          setPreview(URL.createObjectURL(f));
        }
        closeCamera();
      },
      "image/jpeg",
      0.85
    );
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError("");
  }

  function toggleGroup(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function submit() {
    if (!file) return;
    if (selected.length === 0) {
      setError("인증할 그룹을 하나 이상 선택해 주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("photo", file);
      fd.append("groups", JSON.stringify(selected));
      const res = await fetch("/api/checkin", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok && !data.ok) {
        setError(data.error || data.results?.[0]?.error || "인증에 실패했어요.");
        return;
      }
      const failed = (data.results ?? []).filter((r: { ok: boolean }) => !r.ok);
      if (failed.length > 0) {
        setNotice(
          failed
            .map((r: { groupName: string; error: string }) => `${r.groupName}: ${r.error}`)
            .join(" · ")
        );
      }
      setPreview(null);
      setFile(null);
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  }

  const multiGroup = props.groupOptions.length > 1;

  return (
    <div className="card hero">
      <span className="mascot-big">
        <StatusKungya status={props.status} avatar={props.avatar} />
      </span>

      {/* 인증 전에만 남은 시간 표시 (작은 글씨) */}
      {props.status === "before" && countdown && (
        <div className={`clock-sm ${countdown.passed ? "passed" : ""}`}>
          {countdown.passed
            ? `기준 시각에서 ${countdown.text} 지났어요 😱`
            : `출근까지 ${countdown.text}`}
        </div>
      )}
      <div className="date">{dateLabel}</div>

      {props.status === "onTime" ? (
        <div>
          <div className="badge onTime" style={{ fontSize: 15 }}>
            🥳 정시 출근!
          </div>
          <p className="goal">오늘 출근 도장 완료! 내일도 쿵야 화이팅 💪</p>
        </div>
      ) : props.status === "late" ? (
        <div>
          <div className="badge late" style={{ fontSize: 15 }}>
            😭 지각 (+{props.lateMinutes ?? 0}분)
          </div>
          <p className="goal">그래도 도장은 찍었어요. 내일은 정시 출근 가보자고! 🔥</p>
        </div>
      ) : props.status === "excused" ? (
        <p className="goal">오늘은 휴가로 등록되어 있어요. 푹 쉬어요 🏠</p>
      ) : (
        <div>
          {preview ? (
            <div>
              <div className="preview-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="인증 사진 미리보기" />
              </div>
              {multiGroup && (
                <div className="group-select">
                  <p className="goal" style={{ margin: "0 0 6px" }}>
                    이 사진으로 인증할 그룹을 선택하세요
                  </p>
                  {props.groupOptions.map((g) => (
                    <label key={g.groupId} className={`group-check ${g.alreadyChecked ? "off" : ""}`}>
                      <input
                        type="checkbox"
                        checked={selected.includes(g.groupId)}
                        disabled={g.alreadyChecked || busy}
                        onChange={() => toggleGroup(g.groupId)}
                      />
                      {g.groupName}
                      {g.alreadyChecked && " (인증 완료)"}
                    </label>
                  ))}
                </div>
              )}
              <div className="row-actions" style={{ justifyContent: "center" }}>
                <button className="btn cta" onClick={submit} disabled={busy}>
                  {busy
                    ? "도장 찍는 중…"
                    : multiGroup
                      ? `${selected.length}개 그룹에 도장 쿵! 🔨`
                      : "이 사진으로 출근 도장 쿵! 🔨"}
                </button>
                <button
                  className="btn sub"
                  onClick={() => {
                    setPreview(null);
                    setFile(null);
                    openCamera();
                  }}
                  disabled={busy}
                >
                  다시 찍기
                </button>
              </div>
            </div>
          ) : (
            <button className="btn cta" onClick={() => openCamera()}>
              📸 사진 찍고 출근 인증하기
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPick} />
          <p className="goal">
            시각은 서버 기준으로 기록돼요 (조작 불가 🙅) · 무음 촬영이라 조용한 사무실에서도
            안심이에요 🤫
            {!props.isWorkdayToday && (
              <>
                <br />
                오늘은 근무일이 아니에요. 인증은 기록으로만 남아요.
              </>
            )}
          </p>
        </div>
      )}

      {error && <div className="error-msg">{error}</div>}
      {notice && <div className="ok-msg">{notice}</div>}

      {showCamera && (
        <div className="cam-overlay" role="dialog" aria-label="카메라">
          <video ref={videoRef} playsInline muted autoPlay />
          <div className="cam-controls">
            <button className="btn sub" onClick={closeCamera}>
              닫기
            </button>
            <button className="cam-shutter" onClick={capture} aria-label="촬영" />
            <button
              className="btn sub"
              onClick={() => openCamera(facing === "user" ? "environment" : "user")}
            >
              🔄 전환
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
