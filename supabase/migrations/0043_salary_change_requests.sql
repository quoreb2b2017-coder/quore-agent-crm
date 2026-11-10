-- Two-person rule for pay (backlog item 16, F-07): a salary set by HR waits here until a
-- Super Admin who did not ask for it approves it. Only then is a salary_records row written,
-- so payslips, history and onboarding never see an unapproved salary.
create table if not exists public.salary_change_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  -- The salary_records row to write on approval (without created_by).
  record jsonb not null,
  requested_by uuid references public.employees (id) on delete set null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  decided_by uuid references public.employees (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  -- The person who asked can never be the one who decides.
  constraint salary_change_requests_two_people check (decided_by is null or decided_by <> requested_by)
);

create index if not exists salary_change_requests_pending_idx
  on public.salary_change_requests (created_at)
  where status = 'PENDING';

alter table public.salary_change_requests enable row level security;
revoke all on public.salary_change_requests from public, anon, authenticated;
grant all on public.salary_change_requests to service_role;

-- Every request and decision lands in the tamper-evident audit log.
drop trigger if exists trg_audit_salary_change_requests on public.salary_change_requests;
create trigger trg_audit_salary_change_requests
  after insert or update or delete on public.salary_change_requests
  for each row execute function public.log_audit_event();
