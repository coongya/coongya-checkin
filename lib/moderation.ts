// 닉네임 비속어 필터 — 공백·특수문자를 제거한 뒤 금칙어 포함 여부를 검사한다.
// 완벽한 필터는 불가능하므로 흔한 표현 위주의 최소한의 방어선.

const BANNED_WORDS = [
  // 한국어
  "시발",
  "씨발",
  "씨바",
  "시바",
  "쉬발",
  "씨팔",
  "씹",
  "병신",
  "븅신",
  "빙신",
  "새끼",
  "색기",
  "개새",
  "개색",
  "지랄",
  "존나",
  "좆",
  "좃",
  "썅",
  "니미",
  "느금",
  "미친놈",
  "미친년",
  "또라이",
  "닥쳐",
  "꺼져",
  "엿먹",
  "호로",
  "창녀",
  "걸레",
  // 자음 축약
  "ㅅㅂ",
  "ㅆㅂ",
  "ㅂㅅ",
  "ㅄ",
  "ㅈㄹ",
  "ㅗ",
  // 영어
  "fuck",
  "fck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "dick",
  "cunt",
  "whore",
  "slut",
];

/** 우회 방지: 공백·숫자·특수문자를 제거하고 소문자로 정규화 */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\d_\-.,!@#$%^&*()+=~`'"?/\\|<>[\]{}]/g, "");
}

export function containsProfanity(name: string): boolean {
  const n = normalize(name);
  return BANNED_WORDS.some((w) => n.includes(w));
}
