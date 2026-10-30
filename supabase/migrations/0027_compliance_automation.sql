-- 0027_compliance_automation.sql
-- First automated control tests. Each run records, per control, the
-- population examined, the rule version, the result and every exception, and
-- stores an AUTOMATED_TEST evidence item for human review. A source that
-- cannot be read is recorded as COLLECTION_FAILED; nothing is synthesised.
--
--   WT-IAM-03  staff roles hold no restricted permissions
--   WT-IAM-04  Super Admin count and approved SoD exception
--   WT-IAM-05  suspended / terminated employees have no usable login
--   WT-IAM-02  privileged employees have a verified MFA factor
--   WT-LOG-02  audit log hash chain is intact

create or replace function public.record_control_test(
  p_control_code text,
  p_result text,
  p_population jsonb,
  p_exceptions jsonb,
  p_notes text,
  p_rule_version text default 'v1'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  ctl_id uuid;
  ev_id uuid;
  test_id uuid;
begin
  select id into ctl_id from public.compliance_controls where control_code = p_control_code;
  if ctl_id is null then
    raise exception 'unknown control %', p_control_code;
  end if;

  insert into public.evidence_items (
    control_id, title, evidence_type, collection_method, source_system,
    source_record_id, period_start, period_end, limitations
  ) values (
    ctl_id,
    format('%s automated check %s (%s)', p_control_code, p_rule_version, to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"')),
    'AUTOMATED_TEST',
    'AUTOMATED',
    'WorkTrack database',
    'run_automated_control_checks',
    current_date,
    current_date,
    'Point-in-time database query. Covers WorkTrack only, not other admin consoles (GitHub, Supabase, Vercel, Google).'
  )
  returning id into ev_id;

  insert into public.control_tests (
    control_id, execution_identity, method, rule_version, population, result, exceptions, notes, evidence_id
  ) values (
    ctl_id, 'db:run_automated_control_checks', 'AUTOMATED', p_rule_version,
    coalesce(p_population, '{}'::jsonb), p_result, coalesce(p_exceptions, '[]'::jsonb), p_notes, ev_id
  )
  returning id into test_id;

  return test_id;
end;
$$;

create or replace function public.run_automated_control_checks()
returns table (control_code text, result text, exceptions_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  restricted text[] := array[
    'salary.view', 'salary.manage', 'payroll.manage', 'attendance.manage', 'activity.manage',
    'leave.approve', 'policies.manage', 'devices.manage', 'employees.manage', 'audit_logs.view',
    'compliance.manage'
  ];
  pop jsonb;
  exc jsonb;
  n_admins int;
  has_exception boolean;
begin
  -- WT-IAM-03: least privilege for shared staff roles
  select jsonb_build_object(
           'staff_roles', jsonb_agg(distinct r.role_key),
           'role_permission_rows', count(rp.id)
         )
    into pop
  from public.roles r
  left join public.role_permissions rp on rp.role_id = r.id
  where r.role_key in ('AGENT', 'DATABASE', 'EMAIL_MARKETING');

  select coalesce(jsonb_agg(jsonb_build_object('role', r.role_key, 'permission', p.permission_key)), '[]'::jsonb)
    into exc
  from public.role_permissions rp
  join public.roles r on r.id = rp.role_id
  join public.permissions p on p.id = rp.permission_id
  where r.role_key in ('AGENT', 'DATABASE', 'EMAIL_MARKETING')
    and p.permission_key = any (restricted);

  perform public.record_control_test(
    'WT-IAM-03',
    case when jsonb_array_length(exc) = 0 then 'PASS' else 'FAIL' end,
    pop, exc, 'Staff roles must hold none of: ' || array_to_string(restricted, ', ')
  );
  control_code := 'WT-IAM-03'; result := case when jsonb_array_length(exc) = 0 then 'PASS' else 'FAIL' end;
  exceptions_count := jsonb_array_length(exc); return next;

  -- WT-IAM-04: segregation of duties for the Super Admin role
  select count(*) into n_admins
  from public.employee_roles er
  join public.roles r on r.id = er.role_id
  join public.employees e on e.id = er.employee_id
  where r.role_key = 'SUPER_ADMIN' and e.employment_status in ('ACTIVE', 'ON_LEAVE');

  select exists (
    select 1 from public.control_exceptions x
    join public.compliance_controls c on c.id = x.control_id
    where c.control_code in ('WT-IAM-04', 'WT-PAY-01')
      and x.kind = 'SEGREGATION_OF_DUTIES'
      and x.status = 'APPROVED'
      and x.expires_at >= current_date
  ) into has_exception;

  pop := jsonb_build_object('active_super_admins', n_admins, 'approved_sod_exception', has_exception);
  exc := case
    when n_admins = 0 then jsonb_build_array(jsonb_build_object('issue', 'no active Super Admin'))
    when n_admins = 1 and not has_exception then jsonb_build_array(jsonb_build_object(
      'issue', 'single Super Admin performs payroll, attendance and leave administration with no approved SoD exception'))
    else '[]'::jsonb
  end;
  perform public.record_control_test(
    'WT-IAM-04',
    case when jsonb_array_length(exc) = 0 then 'PASS' else 'FAIL' end,
    pop, exc, 'PASS requires either 2+ Super Admins or an approved, unexpired SoD exception.'
  );
  control_code := 'WT-IAM-04'; result := case when jsonb_array_length(exc) = 0 then 'PASS' else 'FAIL' end;
  exceptions_count := jsonb_array_length(exc); return next;

  -- WT-IAM-05: leavers cannot sign in
  if to_regclass('auth.users') is null then
    perform public.record_control_test('WT-IAM-05', 'COLLECTION_FAILED', '{}'::jsonb, '[]'::jsonb,
      'auth.users is not readable from this database role.');
    control_code := 'WT-IAM-05'; result := 'COLLECTION_FAILED'; exceptions_count := 0; return next;
  else
    execute $q$
      select
        jsonb_build_object('blocked_employees', count(*)),
        coalesce(jsonb_agg(jsonb_build_object(
          'employee_code', e.employee_code, 'status', e.employment_status, 'auth_user_id', e.auth_user_id
        )) filter (where u.id is not null and (u.banned_until is null or u.banned_until < now())), '[]'::jsonb)
      from public.employees e
      left join auth.users u on u.id = e.auth_user_id
      where e.employment_status in ('SUSPENDED', 'TERMINATED')
    $q$ into pop, exc;
    perform public.record_control_test(
      'WT-IAM-05',
      case when jsonb_array_length(exc) = 0 then 'PASS' else 'FAIL' end,
      pop, exc, 'Every SUSPENDED or TERMINATED employee must have no auth user or a current ban.'
    );
    control_code := 'WT-IAM-05'; result := case when jsonb_array_length(exc) = 0 then 'PASS' else 'FAIL' end;
    exceptions_count := jsonb_array_length(exc); return next;
  end if;

  -- WT-IAM-02: MFA for privileged employees
  if to_regclass('auth.mfa_factors') is null then
    perform public.record_control_test('WT-IAM-02', 'COLLECTION_FAILED', '{}'::jsonb, '[]'::jsonb,
      'auth.mfa_factors is not available; MFA status could not be read.');
    control_code := 'WT-IAM-02'; result := 'COLLECTION_FAILED'; exceptions_count := 0; return next;
  else
    execute $q$
      select
        jsonb_build_object('privileged_employees', count(*)),
        coalesce(jsonb_agg(jsonb_build_object('employee_code', e.employee_code, 'role', r.role_key))
          filter (where not exists (
            select 1 from auth.mfa_factors f where f.user_id = e.auth_user_id and f.status::text = 'verified'
          )), '[]'::jsonb)
      from public.employees e
      join public.employee_roles er on er.employee_id = e.id and er.is_primary
      join public.roles r on r.id = er.role_id
      where r.role_key in ('SUPER_ADMIN', 'HR')
        and e.employment_status in ('ACTIVE', 'ON_LEAVE')
    $q$ into pop, exc;
    perform public.record_control_test(
      'WT-IAM-02',
      case when jsonb_array_length(exc) = 0 then 'PASS' else 'FAIL' end,
      pop, exc, 'Super Admin and HR accounts need a verified MFA factor. WorkTrack does not yet require aal2 at sign-in.'
    );
    control_code := 'WT-IAM-02'; result := case when jsonb_array_length(exc) = 0 then 'PASS' else 'FAIL' end;
    exceptions_count := jsonb_array_length(exc); return next;
  end if;

  -- WT-LOG-02: audit chain integrity
  select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) into exc from public.verify_audit_chain(1) v;
  select jsonb_build_object(
    'chained_rows', count(*) filter (where row_hash is not null),
    'legacy_unchained_rows', count(*) filter (where row_hash is null)
  ) into pop from public.audit_logs;
  perform public.record_control_test(
    'WT-LOG-02',
    case when jsonb_array_length(exc) = 0 then 'PASS' else 'FAIL' end,
    pop, exc, 'Hash chain verified from the first chained row. Does not detect changes by the database owner that rebuild the chain; an external copy is still required.'
  );
  control_code := 'WT-LOG-02'; result := case when jsonb_array_length(exc) = 0 then 'PASS' else 'FAIL' end;
  exceptions_count := jsonb_array_length(exc); return next;
end;
$$;

revoke execute on function public.record_control_test(text, text, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.run_automated_control_checks() from public, anon, authenticated;
grant execute on function public.run_automated_control_checks() to service_role;

-- Daily at 02:10 UTC where pg_cron is available (same best-effort pattern as 0016).
do $outer$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    null;
  end;
  begin
    perform cron.unschedule('worktrack-control-checks');
  exception when others then
    null;
  end;
  begin
    perform cron.schedule('worktrack-control-checks', '10 2 * * *', 'select * from public.run_automated_control_checks()');
  exception when others then
    null;
  end;
end
$outer$;

notify pgrst, 'reload schema';
