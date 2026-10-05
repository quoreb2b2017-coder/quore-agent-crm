-- 0019_washroom_and_meeting_approval.sql
-- Washroom visits (count and duration for admin).
-- Meetings stay pending until a Super Admin accepts; the timer starts then.

alter table public.meetings alter column started_at drop default;
alter table public.meetings alter column started_at drop not null;

alter table public.meetings
  add column if not exists status text not null default 'ACTIVE',
  add column if not exists requested_at timestamptz not null default now(),
  add column if not exists approved_by uuid references public.employees(id) on delete set null,
  add column if not exists approved_at timestamptz;

update public.meetings
set
  status = case when ended_at is null then 'ACTIVE' else 'ENDED' end,
  requested_at = coalesce(started_at, created_at)
where true;

alter table public.meetings drop constraint if exists meetings_status_check;
alter table public.meetings
  add constraint meetings_status_check
  check (status in ('PENDING', 'ACTIVE', 'ENDED', 'CANCELLED', 'REJECTED'));

create table if not exists public.washroom_visits (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  session_id uuid references public.employee_sessions(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_washroom_employee on public.washroom_visits(employee_id, started_at desc);
create unique index if not exists uq_washroom_open on public.washroom_visits(employee_id) where ended_at is null;

alter table public.washroom_visits enable row level security;
grant all on public.washroom_visits to service_role;
