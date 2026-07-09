-- 쿵야출근단 스키마 v3 — 이메일 계정 + 그룹 나가기(소프트 삭제)
-- Supabase SQL Editor에 붙여넣고 실행하세요.
--
-- ⚠️ v1(members 테이블)에서 업그레이드하는 경우, 먼저 아래 줄의 주석을 풀고 실행해
--    기존 테이블을 초기화하세요 (테스트 데이터가 모두 삭제됩니다):
-- drop table if exists schedule_overrides, absences, checkins, members, memberships, users, groups cascade;
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
  fine_late int not null default 10000,   -- 지각 1회 벌금 (원)
  fine_absent int not null default 10000, -- 무단 미출근 벌금 (원)
  timezone text not null default 'Asia/Seoul',
  created_at timestamptz not null default now()
);

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
