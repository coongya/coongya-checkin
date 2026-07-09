-- 운영자용 PIN 초기화 쿼리 (Supabase SQL Editor에서 실행)
--
-- 사용법:
--   1. 아래 이메일 주소만 사용자의 가입 이메일로 바꿔서 실행하세요.
--   2. 실행하면 해당 계정의 PIN이 '0000'으로 초기화됩니다.
--   3. 사용자에게 "PIN 0000으로 로그인한 뒤, 설정 → PIN 변경에서
--      꼭 새 PIN으로 바꾸세요"라고 안내하세요.
--
-- ⚠️ 재설정 요청 메일의 발신 주소가 아래 이메일과 같은지 꼭 확인하세요
--    (본인 확인 절차입니다).

-- 1) 계정이 있는지 먼저 확인 (닉네임·가입일이 요청자와 맞는지 확인)
select id, username, email, created_at
from users
where email = 'user@example.com'; -- ← 이메일만 바꾸세요

-- 2) PIN을 '0000'으로 초기화 + 발급돼 있던 임시 코드 폐기
update users
set pin_hash = 'a3f9c2e18b7d4056912ef8c04d7ab321:b9b1e4d33e2aa30e0c2f4886a17e8aed9237e4192773edd2f0e79ea731696628'
where email = 'user@example.com'; -- ← 이메일만 바꾸세요

delete from pin_resets
where user_id = (select id from users where email = 'user@example.com'); -- ← 이메일만 바꾸세요
