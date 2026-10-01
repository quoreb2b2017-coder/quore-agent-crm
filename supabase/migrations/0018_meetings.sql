-- 0018_meetings.sql
-- Meeting punch-in. Meeting time is productive working time, never a break.

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  session_id uuid references public.employee_sessions(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_meetings_employee on public.meetings(employee_id, started_at desc);
create unique index if not exists uq_meetings_open on public.meetings(employee_id) where ended_at is null;

-- Read and written only by server actions using the service role.
alter table public.meetings enable row level security;

grant all on public.meetings to service_role;
