-- Read only. Paste into the Supabase SQL Editor and Run.
-- Every row should say true. A false row means that migration is not applied on this database.
select migration, applied from (values
  ('0024 security hardening', exists (select 1 from pg_proc where proname = 'current_employee_id')
                              and exists (select 1 from pg_proc where proname = 'audit_logs_seal')),
  ('0025 compliance core',    to_regclass('public.compliance_controls') is not null
                              and exists (select 1 from pg_proc where proname = 'evidence_items_guard')),
  ('0026 compliance seed',    (select count(*) from public.compliance_controls) > 0),
  ('0027 compliance checks',  exists (select 1 from pg_proc where proname = 'run_automated_control_checks')),
  ('0028 MFA and audit',      exists (select 1 from pg_proc where proname = 'log_security_event')
                              and exists (select 1 from pg_proc where proname = 'redact_onboarding')),
  ('0040 HR cannot run payroll', not exists (
                                select 1 from public.role_permissions rp
                                join public.roles r on r.id = rp.role_id
                                join public.permissions p on p.id = rp.permission_id
                                where r.role_key = 'HR' and p.permission_key = 'payroll.manage')),
  ('0041 online status',      to_regclass('public.employee_presence') is not null),
  ('0042 sign-in attempts',   to_regclass('public.auth_sign_in_attempts') is not null
                              and exists (select 1 from pg_proc where proname = 'purge_operational_data')),
  ('0043 salary approval',    to_regclass('public.salary_change_requests') is not null),
  ('0044 acknowledgements',   to_regclass('public.policy_acknowledgements') is not null),
  ('0045 Super Admin alert',  exists (select 1 from pg_trigger where tgname = 'trg_alert_super_admin_grant')),
  ('0046 staff least privilege', exists (select 1 from pg_trigger where tgname = 'trg_block_restricted_staff_permission')
                              and not exists (
                                select 1 from public.role_permissions rp
                                join public.roles r on r.id = rp.role_id
                                join public.permissions p on p.id = rp.permission_id
                                where r.role_key not in ('SUPER_ADMIN', 'HR')
                                  and p.permission_key in ('salary.view', 'salary.manage', 'payroll.manage', 'attendance.manage',
                                    'activity.manage', 'leave.approve', 'policies.manage', 'devices.manage',
                                    'employees.manage', 'audit_logs.view', 'compliance.manage'))),
  ('0047 outside-app role alert', exists (select 1 from pg_trigger where tgname = 'trg_alert_role_permissions_outside_app')),
  ('0048 settings protected', (select relrowsecurity from pg_class where oid = 'public.app_settings'::regclass)),
  ('pg_cron enabled',         exists (select 1 from pg_extension where extname = 'pg_cron'))
) as checks (migration, applied);
