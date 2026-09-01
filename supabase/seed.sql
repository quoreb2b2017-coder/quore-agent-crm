-- seed.sql
-- Seed roles, permissions, role_permissions, and reference org data.
-- Run AFTER migrations 0001–0006 (npx supabase db push), or paste those
-- migration files in order in the SQL Editor first.
--
-- If you paste only this file into a fresh project, the tables below are
-- created so inserts do not fail. Still apply the rest of the migrations
-- for RLS, attendance, payroll, and the auth hook.

create extension if not exists "pgcrypto";

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  role_key text not null unique,
  display_name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  permission_key text not null unique,
  description text,
  category text,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (role_id, permission_id)
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  head_employee_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.designations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department_id uuid references public.departments(id) on delete set null,
  level int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (title, department_id)
);

create table if not exists public.leave_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_annual_days numeric(5, 2) not null default 0,
  is_paid boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- permissions
-- ============================================================

insert into public.permissions (permission_key, description, category) values
  ('employees.manage', 'Create, edit, deactivate employees', 'Employees'),
  ('attendance.view', 'View attendance records beyond own', 'Attendance'),
  ('attendance.manage', 'Correct/manage attendance records', 'Attendance'),
  ('activity.view', 'View activity/browser data beyond own', 'Activity'),
  ('activity.manage', 'Manage activity data and policy enforcement', 'Activity'),
  ('tasks.view', 'View tasks beyond own', 'Tasks'),
  ('tasks.create', 'Create and assign tasks', 'Tasks'),
  ('tasks.update', 'Update task status/details', 'Tasks'),
  ('campaigns.view', 'View campaigns beyond own', 'Marketing'),
  ('campaigns.create', 'Create campaigns', 'Marketing'),
  ('campaigns.update', 'Update campaigns', 'Marketing'),
  ('leads.view', 'View leads beyond own', 'Marketing'),
  ('leads.manage', 'Create/update leads', 'Marketing'),
  ('field_visits.view', 'View field visits beyond own', 'Field'),
  ('field_visits.manage', 'Manage field visits/check-ins', 'Field'),
  ('salary.view', 'View salary/payroll data beyond own', 'Payroll'),
  ('salary.manage', 'Manage salary records', 'Payroll'),
  ('payroll.manage', 'Run payroll, generate salary slips', 'Payroll'),
  ('leave.view', 'View leave requests beyond own', 'Leave'),
  ('leave.apply', 'Apply for leave', 'Leave'),
  ('leave.approve', 'Approve/reject leave requests', 'Leave'),
  ('reports.view', 'View reports and analytics', 'Reports'),
  ('devices.manage', 'Manage registered devices', 'Devices'),
  ('audit_logs.view', 'View audit logs', 'Audit'),
  ('policies.manage', 'Manage work policies and violations', 'Policies')
on conflict (permission_key) do nothing;

-- ============================================================
-- roles
-- ============================================================

insert into public.roles (role_key, display_name, description, is_system) values
  ('SUPER_ADMIN', 'Super Admin', 'Full platform access', true),
  ('HR', 'HR', 'Employee, attendance, and payroll administration', true),
  ('MANAGER', 'Manager', 'Manages a team of direct reports', true),
  ('AGENT', 'Agent', 'Agent staff — same workspace as Database and Email Marketing', true),
  ('DATABASE', 'Database', 'Database staff — same workspace as Agent and Email Marketing', true),
  ('EMAIL_MARKETING', 'Email Marketing', 'Email marketing staff — same workspace as Agent and Database', true),
  ('FIELD_EMPLOYEE', 'Field Employee', 'Field visits and on-site work', false)
on conflict (role_key) do nothing;

-- ============================================================
-- role_permissions
-- ============================================================

with rp (role_key, permission_key) as (
  values
    -- SUPER_ADMIN: everything
    ('SUPER_ADMIN', 'employees.manage'),
    ('SUPER_ADMIN', 'attendance.view'), ('SUPER_ADMIN', 'attendance.manage'),
    ('SUPER_ADMIN', 'activity.view'), ('SUPER_ADMIN', 'activity.manage'),
    ('SUPER_ADMIN', 'tasks.view'), ('SUPER_ADMIN', 'tasks.create'), ('SUPER_ADMIN', 'tasks.update'),
    ('SUPER_ADMIN', 'campaigns.view'), ('SUPER_ADMIN', 'campaigns.create'), ('SUPER_ADMIN', 'campaigns.update'),
    ('SUPER_ADMIN', 'leads.view'), ('SUPER_ADMIN', 'leads.manage'),
    ('SUPER_ADMIN', 'field_visits.view'), ('SUPER_ADMIN', 'field_visits.manage'),
    ('SUPER_ADMIN', 'salary.view'), ('SUPER_ADMIN', 'salary.manage'), ('SUPER_ADMIN', 'payroll.manage'),
    ('SUPER_ADMIN', 'leave.view'), ('SUPER_ADMIN', 'leave.apply'), ('SUPER_ADMIN', 'leave.approve'),
    ('SUPER_ADMIN', 'reports.view'),
    ('SUPER_ADMIN', 'devices.manage'),
    ('SUPER_ADMIN', 'audit_logs.view'),
    ('SUPER_ADMIN', 'policies.manage'),

    -- HR
    ('HR', 'employees.manage'),
    ('HR', 'attendance.view'), ('HR', 'attendance.manage'),
    ('HR', 'activity.view'),
    ('HR', 'tasks.view'),
    ('HR', 'salary.view'), ('HR', 'salary.manage'), ('HR', 'payroll.manage'),
    ('HR', 'leave.view'), ('HR', 'leave.apply'), ('HR', 'leave.approve'),
    ('HR', 'reports.view'),

    -- MANAGER
    ('MANAGER', 'attendance.view'),
    ('MANAGER', 'activity.view'),
    ('MANAGER', 'tasks.view'), ('MANAGER', 'tasks.create'), ('MANAGER', 'tasks.update'),
    ('MANAGER', 'leave.view'), ('MANAGER', 'leave.apply'), ('MANAGER', 'leave.approve'),
    ('MANAGER', 'reports.view'),

    -- AGENT / DATABASE / EMAIL_MARKETING share the same workspace
    ('AGENT', 'attendance.view'), ('AGENT', 'attendance.manage'),
    ('AGENT', 'activity.view'), ('AGENT', 'activity.manage'),
    ('AGENT', 'tasks.view'), ('AGENT', 'tasks.create'), ('AGENT', 'tasks.update'),
    ('AGENT', 'salary.view'),
    ('AGENT', 'leave.view'), ('AGENT', 'leave.apply'), ('AGENT', 'leave.approve'),
    ('AGENT', 'policies.manage'),

    ('DATABASE', 'attendance.view'), ('DATABASE', 'attendance.manage'),
    ('DATABASE', 'activity.view'), ('DATABASE', 'activity.manage'),
    ('DATABASE', 'tasks.view'), ('DATABASE', 'tasks.create'), ('DATABASE', 'tasks.update'),
    ('DATABASE', 'salary.view'),
    ('DATABASE', 'leave.view'), ('DATABASE', 'leave.apply'), ('DATABASE', 'leave.approve'),
    ('DATABASE', 'policies.manage'),

    ('EMAIL_MARKETING', 'attendance.view'), ('EMAIL_MARKETING', 'attendance.manage'),
    ('EMAIL_MARKETING', 'activity.view'), ('EMAIL_MARKETING', 'activity.manage'),
    ('EMAIL_MARKETING', 'tasks.view'), ('EMAIL_MARKETING', 'tasks.create'), ('EMAIL_MARKETING', 'tasks.update'),
    ('EMAIL_MARKETING', 'salary.view'),
    ('EMAIL_MARKETING', 'leave.view'), ('EMAIL_MARKETING', 'leave.apply'), ('EMAIL_MARKETING', 'leave.approve'),
    ('EMAIL_MARKETING', 'policies.manage'),

    -- FIELD_EMPLOYEE
    ('FIELD_EMPLOYEE', 'field_visits.view'), ('FIELD_EMPLOYEE', 'field_visits.manage'),
    ('FIELD_EMPLOYEE', 'tasks.update'),
    ('FIELD_EMPLOYEE', 'leave.apply')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from rp
join public.roles r on r.role_key = rp.role_key
join public.permissions p on p.permission_key = rp.permission_key
on conflict (role_id, permission_id) do nothing;

-- ============================================================
-- departments / designations (sample reference data)
-- ============================================================

insert into public.departments (name, description) values
  ('Executive', 'Leadership and administration'),
  ('Human Resources', 'HR and people operations'),
  ('Sales', 'Sales and account management'),
  ('Marketing', 'Marketing and campaigns'),
  ('Customer Support', 'Support agents and CRM'),
  ('Field Operations', 'Field visits and on-site work')
on conflict (name) do nothing;

insert into public.designations (title, department_id, level)
select d.title, dep.id, d.level
from (
  values
    ('Chief Executive Officer', 'Executive', 1),
    ('HR Manager', 'Human Resources', 2),
    ('HR Executive', 'Human Resources', 3),
    ('Sales Manager', 'Sales', 2),
    ('Support Agent', 'Customer Support', 3),
    ('Email Marketing Specialist', 'Marketing', 3),
    ('Field Executive', 'Field Operations', 3)
) as d(title, department, level)
join public.departments dep on dep.name = d.department
on conflict (title, department_id) do nothing;

-- ============================================================
-- leave types
-- ============================================================

insert into public.leave_types (name, default_annual_days, is_paid) values
  ('Casual Leave', 18, true),
  ('Sick Leave', 18, true),
  ('Earned Leave', 18, true),
  ('Unpaid Leave', 0, false)
on conflict (name) do nothing;
