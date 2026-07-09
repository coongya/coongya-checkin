export interface Group {
  id: string;
  name: string;
  invite_code: string;
  fine_late: number;
  fine_absent: number;
  timezone: string;
  created_at: string;
}

export interface Member {
  id: string;
  group_id: string;
  name: string;
  pin_hash: string;
  scheduled_time: string; // "HH:MM"
  workdays: string; // ISO weekdays, e.g. "12345" (월~금)
  avatar: string;
  is_admin: boolean;
  created_at: string;
}

export interface Checkin {
  id: string;
  member_id: string;
  work_date: string; // "YYYY-MM-DD" (KST)
  checked_at: string; // ISO timestamptz
  photo_path: string | null;
  is_late: boolean;
  late_minutes: number;
}

export interface Absence {
  id: string;
  member_id: string;
  work_date: string;
  reason: string;
  created_at: string;
}

export interface ScheduleOverride {
  id: string;
  member_id: string;
  work_date: string;
  scheduled_time: string; // HH:MM
  created_at: string;
}

export type DayStatus =
  | "onTime" // 정시 출근
  | "late" // 지각
  | "excused" // 휴가/사유 (벌금 면제)
  | "absent" // 무단 미출근 (벌금)
  | "pending" // 오늘, 아직 인증 전
  | "restDay" // 근무일 아님
  | "future"; // 미래 날짜

export interface AvatarInfo {
  label: string;
  emoji: string; // 이미지가 없을 때 대체 표시
  img?: string; // public 경로의 캐릭터 이미지
}

// 이미지 파일이 public/kungya/에 있으면 true
export const KUNGYA_IMAGES_READY = true;

export const AVATAR_INFO: Record<string, AvatarInfo> = {
  onion: {
    label: "양파쿵야",
    emoji: "🧅",
    img: KUNGYA_IMAGES_READY ? "/kungya/onion.png" : undefined,
  },
  riceball: {
    label: "주먹밥쿵야",
    emoji: "🍙",
    img: KUNGYA_IMAGES_READY ? "/kungya/riceball.png" : undefined,
  },
  celery: {
    label: "샐러리쿵야",
    emoji: "🌸",
    img: KUNGYA_IMAGES_READY ? "/kungya/celery.png" : undefined,
  },
};

export function avatarInfo(key: string): AvatarInfo {
  return AVATAR_INFO[key] ?? AVATAR_INFO.onion;
}
