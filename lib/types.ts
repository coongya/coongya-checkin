export interface Group {
  id: string;
  name: string;
  invite_code: string;
  fine_late: number;
  fine_absent: number;
  timezone: string;
  created_at: string;
}

// 계정 — 앱 전체에서 하나, 여러 그룹에 참여 가능
// email이 로그인 ID (전역 유니크), username(닉네임)은 중복 허용 표시용
export interface User {
  id: string;
  username: string;
  email: string;
  pin_hash: string;
  avatar: string;
  created_at: string;
}

// 멤버십 뷰 — memberships 행 + 계정의 이름/아바타를 합친 형태.
// 통계·화면 코드는 이 타입 하나로 동작한다. id는 membership id.
export interface Member {
  id: string; // membership id
  user_id: string;
  group_id: string;
  name: string; // users.username
  avatar: string; // users.avatar
  scheduled_time: string; // 이 그룹에서의 기준 시각 "HH:MM"
  workdays: string; // ISO weekdays, e.g. "12345" (월~금)
  is_admin: boolean;
  created_at: string; // 그룹 참여일
  left_at: string | null; // 그룹 나간 시각 (null = 활동 중)
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
    img: KUNGYA_IMAGES_READY ? "/kungya/onion.svg" : undefined,
  },
  riceball: {
    label: "주먹밥쿵야",
    emoji: "🍙",
    img: KUNGYA_IMAGES_READY ? "/kungya/riceball.svg" : undefined,
  },
  celery: {
    label: "샐러리쿵야",
    emoji: "🌸",
    img: KUNGYA_IMAGES_READY ? "/kungya/celery.svg" : undefined,
  },
};

export function avatarInfo(key: string): AvatarInfo {
  return AVATAR_INFO[key] ?? AVATAR_INFO.onion;
}
