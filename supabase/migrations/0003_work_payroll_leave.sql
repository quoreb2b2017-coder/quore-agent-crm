-- 0003_work_payroll_leave.sql
-- Tasks, campaigns, leads, salary records/slips, leave types/balances/requests.

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED')),
  owner_id uuid references public.employees(id) on delete set null,
  starts_on date,
  ends_on date,
  emails_processed int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_campaigns_owner on public.campaigns(owner_id);
create index idx_campaigns_status on public.campaigns(status);

create trigger trg_campaigns_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete set null,
  owner_id uuid references public.employees(id) on delete set null,
  full_name text not null,
  email citext,
  phone text,
  status text not null default 'NEW'
    check (status in ('NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST')),
  source text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_leads_owner on public.leads(owner_id);
create index idx_leads_campaign on public.leads(campaign_id);
create index idx_leads_status on public.leads(status);

create trigger trg_leads_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  assigned_to uuid references public.employees(id) on delete set null,
  assigned_by uuid references public.employees(id) on delete set null,
  status text not null default 'TODO'
    check (status in ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED')),
  priority text not null default 'MEDIUM'
    check (priority in ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  due_date date,
  related_campaign_id uuid references public.campaigns(id) on delete set null,
  related_lead_id uuid references public.leads(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_tasks_assigned_to on public.tasks(assigned_to, status);
create index idx_tasks_assigned_by on public.tasks(assigned_by);

create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

create table public.task_steps (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  order_index int not null default 0,
  completed_at timestamptz,
  completed_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_task_steps_task on public.task_steps(task_id, order_index);

create trigger trg_task_steps_updated_at
  before update on public.task_steps
  for each row execute function public.set_updated_at();

-- ============================================================
-- payroll
-- ============================================================

create table public.salary_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  effective_from date not null,
  base_salary numeric(12, 2) not null,
  currency text not null default 'INR',
  pay_frequency text not null default 'MONTHLY'
    check (pay_frequency in ('MONTHLY', 'WEEKLY', 'BIWEEKLY')),
  components jsonb not null default '{}'::jsonb,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_salary_records_employee on public.salary_records(employee_id, effective_from desc);

create trigger trg_salary_records_updated_at
  before update on public.salary_records
  for each row execute function public.set_updated_at();

create table public.salary_slips (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  period_month int not null check (period_month between 1 and 12),
  period_year int not null,
  gross_amount numeric(12, 2),
  net_amount numeric(12, 2),
  deductions jsonb not null default '{}'::jsonb,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'FINALIZED', 'PAID')),
  file_path text,
  generated_at timestamptz,
  generated_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, period_year, period_month)
);

create index idx_salary_slips_employee on public.salary_slips(employee_id, period_year desc, period_month desc);

create trigger trg_salary_slips_updated_at
  before update on public.salary_slips
  for each row execute function public.set_updated_at();

-- ============================================================
-- leave
-- ============================================================

create table if not exists public.leave_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_annual_days numeric(5, 2) not null default 0,
  is_paid boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_leave_types_updated_at
  before update on public.leave_types
  for each row execute function public.set_updated_at();

create table public.leave_balances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id) on delete cascade,
  year int not null,
  allocated_days numeric(5, 2) not null default 0,
  used_days numeric(5, 2) not null default 0,
  carried_forward_days numeric(5, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, leave_type_id, year)
);

create index idx_leave_balances_employee on public.leave_balances(employee_id, year);

create trigger trg_leave_balances_updated_at
  before update on public.leave_balances
  for each row execute function public.set_updated_at();

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  days_count numeric(5, 2) not null,
  reason text,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  reviewed_by uuid references public.employees(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index idx_leave_requests_employee_status on public.leave_requests(employee_id, status);
create index idx_leave_requests_reviewed_by on public.leave_requests(reviewed_by);

create trigger trg_leave_requests_updated_at
  before update on public.leave_requests
  for each row execute function public.set_updated_at();
