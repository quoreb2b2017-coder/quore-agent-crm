-- 1. Open-breaks index (docs/performance/proposed-indexes.sql).
--    Plain create index: migrations run inside a transaction, where CONCURRENTLY is not allowed.
--    The table is small enough that the build takes well under a second.
create index if not exists idx_breaks_open
  on public.breaks (employee_id)
  where ended_at is null;

-- 2. Every password sign-in, kept for security alerts and the lockout.
--    Written by the server only, after it has really asked Supabase Auth.
create table if not exists public.auth_sign_in_attempts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  ip text,
  user_agent text,
  succeeded boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists auth_sign_in_attempts_email_idx
  on public.auth_sign_in_attempts (email, created_at desc);
create index if not exists auth_sign_in_attempts_ip_idx
  on public.auth_sign_in_attempts (ip, created_at desc);

alter table public.auth_sign_in_attempts enable row level security;
revoke all on public.auth_sign_in_attempts from public, anon, authenticated;
grant all on public.auth_sign_in_attempts to service_role;

-- 3. Retention for short-lived operational data. Records the business keeps
--    (attendance, leave, salary, payslips, audit logs, onboarding) are never touched here.
create or replace function public.purge_operational_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.employee_presence where last_seen_at < now() - interval '30 days';
  delete from public.auth_sign_in_attempts where created_at < now() - interval '180 days';
  delete from public.notifications where is_read and created_at < now() - interval '180 days';
  delete from public.push_subscriptions where updated_at < now() - interval '180 days';
end;
$$;

revoke all on function public.purge_operational_data() from public, anon, authenticated;
grant execute on function public.purge_operational_data() to service_role;

-- Daily at 03:30 UTC once pg_cron is enabled (Supabase: Database > Extensions).
-- Without it the function still exists and can be run by hand.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'worktrack-retention';
    perform cron.schedule('worktrack-retention', '30 3 * * *', 'select public.purge_operational_data()');
  end if;
end;
$$;
