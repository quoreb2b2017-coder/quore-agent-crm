-- 0004_ops_tables.sql
-- Notifications, work policies, policy violations, devices, audit logs.

create table public.work_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  rule_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_work_policies_updated_at
  before update on public.work_policies
  for each row execute function public.set_updated_at();

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  device_name text,
  device_type text check (device_type in ('LAPTOP', 'DESKTOP', 'MOBILE')),
  os text,
  browser_extension_version text,
  last_seen_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_devices_employee on public.devices(employee_id);

create trigger trg_devices_updated_at
  before update on public.devices
  for each row execute function public.set_updated_at();

alter table public.employee_sessions
  add constraint fk_employee_sessions_device
  foreign key (device_id) references public.devices(id) on delete set null;

create table public.policy_violations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  policy_id uuid references public.work_policies(id) on delete set null,
  violation_type text not null,
  severity text not null default 'LOW'
    check (severity in ('LOW', 'MEDIUM', 'HIGH')),
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb,
  resolved boolean not null default false,
  resolved_by uuid references public.employees(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_policy_violations_employee on public.policy_violations(employee_id, occurred_at desc);
create index idx_policy_violations_resolved on public.policy_violations(resolved);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_employee on public.notifications(employee_id, is_read, created_at desc);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_employee_id uuid references public.employees(id) on delete set null,
  action text not null,
  table_name text,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);

create index idx_audit_logs_table_record on public.audit_logs(table_name, record_id);
create index idx_audit_logs_actor on public.audit_logs(actor_employee_id, created_at desc);
create index idx_audit_logs_created on public.audit_logs(created_at desc);

-- ============================================================
-- generic audit trigger, attached to sensitive tables below
-- ============================================================

create or replace function public.log_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (actor_employee_id, action, table_name, record_id, old_data, new_data)
  values (
    public.current_employee_id(),
    tg_op || '_' || tg_table_name,
    tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

create trigger trg_audit_employees
  after insert or update or delete on public.employees
  for each row execute function public.log_audit_event();

create trigger trg_audit_employee_roles
  after insert or update or delete on public.employee_roles
  for each row execute function public.log_audit_event();

create trigger trg_audit_role_permissions
  after insert or update or delete on public.role_permissions
  for each row execute function public.log_audit_event();

create trigger trg_audit_salary_records
  after insert or update or delete on public.salary_records
  for each row execute function public.log_audit_event();

create trigger trg_audit_salary_slips
  after insert or update or delete on public.salary_slips
  for each row execute function public.log_audit_event();

create trigger trg_audit_leave_requests
  after insert or update or delete on public.leave_requests
  for each row execute function public.log_audit_event();

create trigger trg_audit_work_policies
  after insert or update or delete on public.work_policies
  for each row execute function public.log_audit_event();
