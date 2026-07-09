-- 출근쿵야 데이터베이스 스키마
-- Supabase SQL Editor에 붙여넣고 실행하세요.

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  fine_late int not null default 10000,   -- 지각 1회 벌금 (원)
  fine_absent int not null default 10000, -- 무단 미출근 벌금 (원)
  timezone text not null default 'Asia/Seoul',
  created_at timestamptz not null default now()
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  name text not null,
  pin_hash text not null,
  scheduled_time text not null default '09:00', -- 멤버별 기준 출근 시각 (HH:MM)
  workdays text not null default '12345',       -- ISO 요일 (월=1 ... 일=7)
  avatar text not null default 'onion',
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  unique (group_id, name)
);

create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  work_date date not null,                       -- KST 기준 날짜
  checked_at timestamptz not null default now(), -- 서버 타임스탬프
  photo_path text,
  is_late boolean not null default false,
  late_minutes int not null default 0,
  unique (member_id, work_date)
);

create table if not exists absences (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  work_date date not null,
  reason text not null default '휴가',
  created_at timestamptz not null default now(),
  unique (member_id, work_date)
);

create index if not exists idx_members_group on members(group_id);
create index if not exists idx_checkins_member_date on checkins(member_id, work_date);
create index if not exists idx_absences_member_date on absences(member_id, work_date);

-- 사진 저장용 Storage 버킷 (비공개 — 앱 서버가 그룹 멤버 확인 후 프록시로 서빙)
insert into storage.buckets (id, name, public)
values ('checkin-photos', 'checkin-photos', false)
on conflict (id) do update set public = false;

-- 참고: 이 앱은 service_role 키로만 DB/Storage에 접근하므로(서버 전용),
-- anon 키를 쓰지 않아 RLS 정책 없이도 클라이언트가 직접 접근할 경로가 없습니다.
-- 만약 나중에 anon 키를 사용하게 되면 반드시 각 테이블에 RLS를 활성화하세요.
