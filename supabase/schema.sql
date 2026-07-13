-- 쿵야출근단 스키마 v3 — 이메일 계정 + 그룹 나가기(소프트 삭제)
-- Supabase SQL Editor에 붙여넣고 실행하세요. (모든 구문이 if not exists라 재실행해도 안전)
--
-- ⚠️ v1(members 테이블)에서 업그레이드하는 경우, 먼저 아래 줄의 주석을 풀고 실행해
--    기존 테이블을 초기화하세요 (테스트 데이터가 모두 삭제됩니다):
-- drop table if exists schedule_overrides, absences, checkins, members, memberships, users, groups, pin_resets cascade;
--
-- ⚠️ v2에서 업그레이드하는 경우 아래 마이그레이션 블록의 주석을 풀고 실행하세요:
-- alter table users add column if not exists email text;
-- update users set email = username || '@migrate.invalid' where email is null; -- 기존 유저는 임시 이메일 (직접 정리 필요)
-- alter table users alter column email set not null;
-- alter table users add constraint users_email_key unique (email);
-- alter table users drop constraint if exists users_username_key;
-- alter table memberships add column if not exists left_at timestamptz;
-- alter table memberships drop constraint if exists memberships_user_id_group_id_key;
-- create unique index if not exists idx_memberships_active_unique
--   on memberships(user_id, group_id) where (left_at is null);

-- 계정: 앱 전체에서 하나. 이메일이 전역 유니크(로그인 ID), 닉네임은 중복 허용.
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text not null,           -- 닉네임 (중복 허용, 표시용)
  email text not null unique,       -- 로그인 ID
  pin_hash text not null,
  avatar text not null default 'onion',
  created_at timestamptz not null default now()
);

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  fine_late int not null default 10000,   -- 지각 1회 벌금 (원) — 현재 금액 (표시용)
  fine_absent int not null default 10000, -- 무단 미출근 벌금 (원) — 현재 금액 (표시용)
  timezone text not null default 'Asia/Seoul',
  start_date date not null default (now() at time zone 'Asia/Seoul')::date, -- 기록·벌금 시작일
  created_at timestamptz not null default now()
);

-- v3 → v4 마이그레이션: 기존 groups 테이블에 시작일 추가 (기존 그룹은 만든 날짜가 시작일)
alter table groups add column if not exists start_date date;
update groups set start_date = (created_at at time zone 'Asia/Seoul')::date where start_date is null;
alter table groups alter column start_date set not null;
alter table groups alter column start_date set default (now() at time zone 'Asia/Seoul')::date;

-- 벌금 금액 변경 이력 — 날짜별 벌금 계산은 "그 날짜에 유효했던 금액"으로 한다.
-- 금액을 바꿔도 과거 벌금이 다시 계산되지 않도록 변경 시점(적용 시작일)마다 한 줄씩 기록.
create table if not exists group_fine_history (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  effective_from date not null,  -- 이 날짜부터 아래 금액 적용
  fine_late int not null,
  fine_absent int not null,
  created_at timestamptz not null default now(),
  unique (group_id, effective_from)
);
create index if not exists idx_fine_history_group on group_fine_history(group_id);

-- 이력이 없는 기존 그룹은 현재 금액을 시작일부터 적용한 것으로 시드
insert into group_fine_history (group_id, effective_from, fine_late, fine_absent)
select g.id, g.start_date, g.fine_late, g.fine_absent
from groups g
where not exists (select 1 from group_fine_history h where h.group_id = g.id);

-- 멤버십: 한 계정이 여러 그룹에 참여. 그룹별 기준 시각·근무 요일은 여기에.
-- left_at이 채워지면 "나간" 멤버십 — 데이터(체크인 등)는 남지만 집계·화면에서 제외.
create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  group_id uuid not null references groups(id) on delete cascade,
  scheduled_time text not null default '09:00', -- 이 그룹에서의 기준 출근 시각 (HH:MM)
  workdays text not null default '12345',       -- ISO 요일 (월=1 ... 일=7)
  is_admin boolean not null default false,
  created_at timestamptz not null default now(), -- 그룹 참여일 (이전 날짜는 벌금 제외)
  left_at timestamptz                            -- 그룹 나간 시각 (null = 활동 중)
);

-- 활동 중인 멤버십만 (user, group) 쌍이 유일 — 나갔다가 다시 참여하면 새 행이 생긴다
create unique index if not exists idx_memberships_active_unique
  on memberships(user_id, group_id) where (left_at is null);

-- v4 → v5 마이그레이션: 푸시 알림 설정 (그룹별)
-- reminders: 출근 리마인더 시점(분 전) 콤마 목록, 예: "5,30" (빈 문자열 = 끔)
-- notify_checkin: 같은 그룹 멤버가 출석하면 알림 받기
alter table memberships add column if not exists reminders text not null default '';
alter table memberships add column if not exists notify_checkin boolean not null default false;

-- 웹 푸시 구독 — 기기(브라우저)마다 한 줄. endpoint가 기기 식별자 역할.
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_push_subs_user on push_subscriptions(user_id);

-- 리마인더 중복 발송 방지 — (멤버, 날짜, N분 전)당 1회만
create table if not exists reminder_log (
  member_id uuid not null references memberships(id) on delete cascade,
  work_date date not null,
  offset_min int not null,
  created_at timestamptz not null default now(),
  primary key (member_id, work_date, offset_min)
);

-- 출근 기록: member_id는 membership id를 가리킴
create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references memberships(id) on delete cascade,
  work_date date not null,                       -- KST 기준 날짜
  checked_at timestamptz not null default now(), -- 서버 타임스탬프
  photo_path text,
  is_late boolean not null default false,
  late_minutes int not null default 0,
  unique (member_id, work_date)
);

create table if not exists absences (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references memberships(id) on delete cascade,
  work_date date not null,
  reason text not null default '휴가',
  created_at timestamptz not null default now(),
  unique (member_id, work_date)
);

-- 특정 일자의 기준 출근 시각 변경 (예: 병원 들렀다 11시 출근)
create table if not exists schedule_overrides (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references memberships(id) on delete cascade,
  work_date date not null,
  scheduled_time text not null, -- HH:MM
  created_at timestamptz not null default now(),
  unique (member_id, work_date)
);

-- PIN 재설정 임시 코드 — 그룹 관리자가 발급한 6자리 코드의 해시 (유저당 1개, 1회용)
create table if not exists pin_resets (
  user_id uuid primary key references users(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_memberships_user on memberships(user_id);
create index if not exists idx_memberships_group on memberships(group_id);
create index if not exists idx_checkins_member_date on checkins(member_id, work_date);
create index if not exists idx_absences_member_date on absences(member_id, work_date);
create index if not exists idx_overrides_member_date on schedule_overrides(member_id, work_date);

-- 사진 저장용 Storage 버킷 (비공개 — 앱 서버가 그룹 멤버 확인 후 프록시로 서빙)
insert into storage.buckets (id, name, public)
values ('checkin-photos', 'checkin-photos', false)
on conflict (id) do update set public = false;

-- 참고: 이 앱은 service_role 키로만 DB/Storage에 접근하므로(서버 전용),
-- anon 키를 쓰지 않아 RLS 정책 없이도 클라이언트가 직접 접근할 경로가 없습니다.
-- 만약 나중에 anon 키를 사용하게 되면 반드시 각 테이블에 RLS를 활성화하세요.
