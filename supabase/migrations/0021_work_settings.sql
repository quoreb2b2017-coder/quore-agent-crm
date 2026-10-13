-- Company shift clock and default paid-leave quota. One row.
-- Run once in the Supabase SQL Editor.

create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  time_zone text not null default 'Asia/Kolkata',
  login_minutes int not null default 1110 check (login_minutes between 0 and 1439),
  logout_minutes int not null default 210 check (logout_minutes between 0 and 1439),
  late_minutes int not null default 1140 check (late_minutes between 0 and 1439),
  annual_paid_leave_days numeric(5, 2) not null default 18 check (annual_paid_leave_days >= 0),
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id)
values (1)
on conflict (id) do nothing;

grant all on public.app_settings to service_role;

notify pgrst, 'reload schema';
