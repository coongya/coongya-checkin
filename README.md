# 쿵야출근단 🥳

> 사진 한 장으로 출근 도장 쿵! 쿵야들과 함께 쓰는 출근 인증 · 지각 벌금 · 통계 웹앱

같은 그룹(로그)에 참여한 멤버들이 **사진으로 출근을 인증**하면 서버 타임스탬프가 찍히고,
멤버별 기준 시각으로 **지각을 판정**해 **벌금과 통계**를 기록합니다.

<p align="center">
  <img src="docs/screenshot-landing.png" width="240" alt="랜딩" />
  <img src="docs/screenshot-dashboard.png" width="240" alt="대시보드" />
  <img src="docs/screenshot-stats.png" width="240" alt="통계" />
</p>

## 주요 기능

- **그룹(로그)**: 그룹 생성 시 6자리 초대코드 발급, 초대코드로 참여
- **간편 로그인**: 닉네임 + PIN(숫자 4~6자리), HMAC 서명 쿠키 세션
- **무음 사진 인증**: 브라우저 내 카메라 스트림 캡처(getUserMedia + canvas) — 셔터음 없음,
  EXIF(GPS 등) 메타데이터 미포함. 권한 거부 시 기본 카메라 앱으로 폴백
- **서버 타임스탬프**: 인증 시각은 API 서버 수신 시각(KST) 기준 — 기기 시계 조작 불가
- **지각 판정**: 멤버별 기준 출근 시각 · 근무 요일 설정 가능
- **벌금**: 지각 1회 10,000원 · 무단 미출근 10,000원 (관리자가 금액 변경 가능)
- **휴가 등록**: 휴가/재택/교육/아파요 — 등록한 날짜는 벌금 면제
- **통계**: 월별 성적표, 출근 달력(정시 출근하면 내 쿵야 도장이 쾅!), 벌금왕/성실왕 랭킹
- **공정성**: 그룹 참여일 이전 날짜는 판정/벌금 대상에서 제외
- **상태 이모지**: 출근 🥳 · 지각 😭 · 휴가/재택 🏠 · 미출근 😴

## 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | Next.js (App Router) + TypeScript | 서버 컴포넌트로 API·화면 일체형 구성 |
| DB / 사진 저장 | Supabase (PostgreSQL + Storage) | 무료 티어로 충분, SQL 스키마 관리 용이 |
| 배포 | Vercel | GitHub 연동 자동 배포, Hobby 플랜 무료 |
| 인증 | 자체 PIN(scrypt 해시) + HMAC 세션 쿠키 | 소규모 그룹에 맞는 마찰 없는 로그인 |

## 설계 노트

- **타임스탬프 무결성**: 지각 판정은 클라이언트가 보낸 값이 아니라 서버가 요청을 받은
  시각으로만 수행합니다. 사진 EXIF나 기기 시계는 신뢰하지 않습니다.
- **하루 1회 인증**: `checkins(member_id, work_date)` 유니크 제약으로 중복 도장 방지
- **벌금은 저장하지 않고 파생**: 규칙(금액)이 바뀌어도 과거 기록으로 재계산됩니다
- **사진 접근 제어**: 비공개 Storage 버킷 + 서버 프록시 — 같은 그룹 멤버가 로그인한
  상태에서만 열람 가능
- **무차별 대입 방어**: 로그인/그룹 참여는 IP당 분당 10회 제한
- **service_role 키는 서버 전용**: 클라이언트에는 어떤 Supabase 키도 노출되지 않으며,
  anon 키를 쓰지 않으므로 RLS 우회 경로가 없습니다

## 시작하기 (로컬)

```bash
npm install
MOCK_DB=1 npm run dev   # Supabase 없이 인메모리 DB로 바로 실행 (데이터 미저장)
```

실제 데이터 저장을 원하면 `.env.example`을 `.env.local`로 복사하고 아래 배포 가이드의
Supabase 단계를 진행한 뒤 값을 채워주세요.

## 배포 가이드 (무료)

### 1. Supabase (데이터 + 사진 저장)

1. [supabase.com](https://supabase.com) 가입 → **New project** (Region: Northeast Asia 권장)
2. 왼쪽 메뉴 **SQL Editor** → `supabase/schema.sql` 내용 붙여넣고 **Run**
3. **Settings → API**에서 두 값 복사:
   - `Project URL`
   - `service_role` 키 (⚠️ 절대 공개 금지 — 서버 환경변수로만)

### 2. Vercel (호스팅)

1. 이 저장소를 GitHub에 push
2. [vercel.com](https://vercel.com) → **Add New → Project** → GitHub 저장소 Import
3. **Environment Variables**에 3개 입력:

   | 이름 | 값 |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role 키 |
   | `SESSION_SECRET` | 긴 랜덤 문자열 (예: `openssl rand -base64 32` 결과) |

4. **Deploy** → 발급된 `https://….vercel.app` 주소를 쿵야들에게 공유!

> 휴대폰 브라우저에서 열고 **홈 화면에 추가**하면 앱처럼 쓸 수 있어요.
> 카메라는 HTTPS에서만 동작하는데 Vercel 배포는 기본 HTTPS라 문제없어요.

## 프로젝트 구조

```
app/
  api/            # REST API (그룹·참여·로그인·체크인·휴가·사진 프록시)
  dashboard/      # 오늘 현황 + 출근 인증
  stats/          # 월별 성적표 · 출근 달력 · 랭킹
  settings/       # 내 설정 · 휴가 등록 · 그룹(벌금) 설정
components/       # UI 컴포넌트 (무음 카메라, 아바타 등)
lib/
  db/             # DB 추상화 (supabase / 인메모리 mock)
  stats.ts        # 지각·벌금·통계 계산 (순수 함수)
  time.ts         # KST 시간 유틸
  session.ts      # 세션 쿠키 · PIN 해시
supabase/
  schema.sql      # 테이블 + Storage 버킷 생성 SQL
docs/             # 스크린샷
```

## 캐릭터

양파쿵야 · 주먹밥쿵야 · 샐러리쿵야 (`public/kungya/`)
