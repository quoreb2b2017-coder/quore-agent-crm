-- 0002_attendance_activity.sql
-- Sessions, attendance, breaks, activity events (browser/application).

create table public.employee_sessions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  login_ip inet,
  user_agent text,
  device_id uuid, -- FK to devices added in 0004
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'ENDED', 'TIMED_OUT')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_employee_sessions_employee on public.employee_sessions(employee_id, started_at desc);
create unique index uq_employee_sessions_active on public.employee_sessions(employee_id) where status = 'ACTIVE';

create trigger trg_employee_sessions_updated_at
  before update on public.employee_sessions
  for each row execute function public.set_updated_at();

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  attendance_date date not null,
  first_check_in timestamptz,
  last_check_out timestamptz,
  total_active_seconds int not null default 0,
  total_break_seconds int not null default 0,
  total_idle_seconds int not null default 0,
  status text not null default 'ABSENT'
    check (status in ('PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY', 'WEEK_OFF')),
  source text not null default 'AUTO'
    check (source in ('AUTO', 'MANUAL', 'CORRECTED')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, attendance_date)
);

create index idx_attendance_employee_date on public.attendance(employee_id, attendance_date desc);
create index idx_attendance_date on public.attendance(attendance_date);

create trigger trg_attendance_updated_at
  before update on public.attendance
  for each row execute function public.set_updated_at();

create table public.breaks (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  session_id uuid not null references public.employee_sessions(id) on delete cascade,
  break_type text not null default 'GENERAL',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_breaks_session on public.breaks(session_id);
create index idx_breaks_employee on public.breaks(employee_id, started_at desc);

create trigger trg_breaks_updated_at
  before update on public.breaks
  for each row execute function public.set_updated_at();

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  session_id uuid references public.employee_sessions(id) on delete set null,
  event_type text not null,
  source text not null,
  domain text,
  application_name text,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds int,
  category text not null default 'UNKNOWN'
    check (category in ('WORK', 'NON_WORK', 'BREAK', 'IDLE', 'UNKNOWN')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_activity_events_employee_started on public.activity_events(employee_id, started_at);
create index idx_activity_events_session_started on public.activity_events(session_id, started_at);
create index idx_activity_events_employee_category on public.activity_events(employee_id, category, started_at);

create table public.browser_activities (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  session_id uuid references public.employee_sessions(id) on delete set null,
  activity_event_id uuid references public.activity_events(id) on delete cascade,
  domain text,
  tab_url_path text,
  window_id text,
  is_incognito boolean not null default false,
  category text not null default 'UNKNOWN'
    check (category in ('WORK', 'NON_WORK', 'BREAK', 'IDLE', 'UNKNOWN')),
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds int,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_browser_activities_employee_started on public.browser_activities(employee_id, started_at);

create table public.application_activities (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  session_id uuid references public.employee_sessions(id) on delete set null,
  activity_event_id uuid references public.activity_events(id) on delete cascade,
  process_name text,
  window_title text,
  is_productive boolean,
  category text not null default 'UNKNOWN'
    check (category in ('WORK', 'NON_WORK', 'BREAK', 'IDLE', 'UNKNOWN')),
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds int,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_application_activities_employee_started on public.application_activities(employee_id, started_at);
