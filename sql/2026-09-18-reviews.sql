-- 유료 딥리딩 후기 기능. Supabase SQL Editor에서 1회 실행.
-- (참고용으로 저장해두는 파일 — Supabase 자체 마이그레이션 도구는 안 씀, 여기 CLI에는 DB 실행 권한이 없어서
-- 이 SQL은 사용자가 직접 Supabase 대시보드에서 실행해야 함.)

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reading_history_id uuid not null references reading_history(id) on delete cascade,
  user_id uuid not null,
  spread_type text,
  pet_name text,
  display_name text,       -- "김ㅇㅇ" 식으로 마스킹된 이름. 실명은 저장하지 않음.
  rating smallint not null check (rating between 1 and 5),
  comment text,
  approved boolean not null default false,  -- 후기 10개 이상 모여서 공개 위젯 만들 때, 사람이 검수 후 true로 바꾸는 용도
  unique (reading_history_id)  -- 리딩 1건당 후기 1개, 재제출은 덮어쓰기(수정)로 처리
);

alter table reviews enable row level security;
-- 의도적으로 정책을 하나도 안 만듦: anon/authenticated 키로는 읽기/쓰기 전부 막힘.
-- 서버(Netlify function, service role key)만 접근 가능 — 후기 내용이 공개되기 전엔 아무도 못 봄.

-- 마이페이지에서 "후기 남기기" / "후기 수정하기" 버튼 라벨을 정하기 위한 플래그.
alter table reading_history add column if not exists reviewed boolean not null default false;
