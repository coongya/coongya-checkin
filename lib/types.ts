export interface Group {
  id: string;
  name: string;
  invite_code: string;
  fine_late: number; // 현재 지각 벌금 (이력이 없을 때의 대체값)
  fine_absent: number; // 현재 무단 미출근 벌금 (이력이 없을 때의 대체값)
  timezone: string;
  start_date: string; // "YYYY-MM-DD" — 이 날짜부터 기록·벌금 판정 시작
  created_at: string;
}

// 벌금 금액 변경 이력 — effective_from(포함)부터 이 금액이 적용된다.
// 날짜별 벌금은 "그 날짜에 유효했던 금액"으로 계산해, 금액을 바꿔도 과거가 안 바뀐다.
export interface FineRule {
  effective_from: string; // "YYYY-MM-DD"
  fine_late: number;
  fine_absent: number;
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
  reminders: string; // 출근 리마인더 시점(분 전) 콤마 목록, 예 "5,30" ("" = 끔)
  notify_checkin: boolean; // 같은 그룹 멤버 출석 알림 받기
  created_at: string; // 그룹 참여일
  left_at: string | null; // 그룹 나간 시각 (null = 활동 중)
}

// 출근 리마인더로 선택할 수 있는 시점 (분 전)
export const REMINDER_OFFSETS = [5, 10, 15, 30, 60] as const;

/** "5,30" 형태의 reminders 문자열 → 허용된 값만 걸러 숫자 배열로 */
export function parseReminders(s: string): number[] {
  if (!s) return [];
  const allowed = new Set<number>(REMINDER_OFFSETS);
  return [...new Set(s.split(","))]
    .map((x) => parseInt(x, 10))
    .filter((n) => allowed.has(n))
    .sort((a, b) => a - b);
}

// 웹 푸시 구독 — 기기(브라우저)마다 한 줄
export interface PushSub {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
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
