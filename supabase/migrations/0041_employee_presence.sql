-- When each person's app last checked in. Drives "online" and chat's delivered tick without a socket server.
-- A separate table: the heartbeat writes every 20 seconds, which must not fill the audit log on employees.
create table if not exists public.employee_presence (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

create index if not exists employee_presence_last_seen_idx
  on public.employee_presence (last_seen_at desc);

-- Server only: no policies, so signed-in users cannot read or forge it directly.
alter table public.employee_presence enable row level security;
revoke all on public.employee_presence from public, anon, authenticated;
grant all on public.employee_presence to service_role;
