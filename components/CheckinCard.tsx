"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import KungyaFace from "@/components/KungyaFace";

interface Props {
  avatar: string;
  scheduledTime: string;
  alreadyChecked: boolean;
  checkedTime?: string; // HH:MM:SS
  wasLate?: boolean;
  lateMinutes?: number;
  isWorkdayToday: boolean;
  hasAbsenceToday: boolean;
}

function nowKst(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
}

export default function CheckinCard(props: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [clock, setClock] = useState("");
  const [dateLabel, setDateLabel] = useState("");

  useEffect(() => {
    const tick = () => {
      const d = nowKst();
      setClock(
        [d.getHours(), d.getMinutes(), d.getSeconds()]
          .map((n) => String(n).padStart(2, "0"))
          .join(":")
      );
      setDateLabel(
        d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const closeCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setShowCamera(false);
  }, []);

  // 페이지 이탈 시 카메라 정리
  useEffect(() => closeCamera, [closeCamera]);

  async function openCamera(nextFacing?: "user" | "environment") {
    const f = nextFacing ?? facing;
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: f, width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false, // 오디오 미사용 → 셔터음 없음
      });
      streamRef.current = stream;
      setFacing(f);
      setShowCamera(true);
      setError("");
      // 렌더 후 비디오에 스트림 연결
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
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

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch("/api/checkin", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "인증에 실패했어요.");
        return;
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

  return (
    <div className="card hero">
      <span className="mascot-big">
        {props.alreadyChecked ? (
          props.wasLate ? "😭" : "🥳"
        ) : (
          <KungyaFace avatar={props.avatar} size={72} />
        )}
      </span>
      <div className="clock">{clock || "--:--:--"}</div>
      <div className="date">{dateLabel}</div>

      {props.alreadyChecked ? (
        <div>
          <div className={`badge ${props.wasLate ? "late" : "onTime"}`} style={{ fontSize: 15 }}>
            {props.wasLate
              ? `😭 ${props.checkedTime} 지각 (+${props.lateMinutes}분)`
              : `🥳 ${props.checkedTime} 정시 출근!`}
          </div>
          <p className="goal">오늘 출근 도장 완료! 내일도 쿵야 화이팅 💪</p>
        </div>
      ) : props.hasAbsenceToday ? (
        <p className="goal">오늘은 휴가로 등록되어 있어요. 푹 쉬어요 🏠</p>
      ) : (
        <div>
          {preview ? (
            <div>
              <div className="preview-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="인증 사진 미리보기" />
              </div>
              <div className="row-actions" style={{ justifyContent: "center" }}>
                <button className="btn cta" onClick={submit} disabled={busy}>
                  {busy ? "도장 찍는 중…" : "이 사진으로 출근 도장 쿵! 🔨"}
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
            기준 시각 <b>{props.scheduledTime}</b> — 시각은 서버 기준으로 기록돼요 (조작 불가 🙅)
            <br />
            무음 촬영이라 조용한 사무실에서도 안심이에요 🤫
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
