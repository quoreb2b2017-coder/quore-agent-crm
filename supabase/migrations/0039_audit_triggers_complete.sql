-- Complete audit coverage for every sensitive live table.
-- 1) Ensure INSERT/UPDATE/DELETE triggers exist
-- 2) Provide append_audit_log() for app/sync backfill
-- 3) Snapshot any live rows that were never audited (meetings, settings, …)

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

create or replace function public.log_audit_event_settings()
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
    null,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

-- App / sync can append a sealed snapshot when a table had no trigger historically.
create or replace function public.append_audit_log(
  p_table text,
  p_record_id uuid,
  p_action text,
  p_old jsonb default null,
  p_new jsonb default null,
  p_actor uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if p_table is null or length(trim(p_table)) = 0 then
    raise exception 'table required' using errcode = '22023';
  end if;
  if p_action is null or p_action !~ '^[A-Z]+_[a-z0-9_]+$' then
    raise exception 'invalid action' using errcode = '22023';
  end if;

  insert into public.audit_logs (
    actor_employee_id, action, table_name, record_id, old_data, new_data, actor_source
  ) values (
    p_actor,
    p_action,
    p_table,
    p_record_id,
    p_old,
    p_new,
    'service_job'
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke execute on function public.append_audit_log(text, uuid, text, jsonb, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.append_audit_log(text, uuid, text, jsonb, jsonb, uuid)
  to service_role;

do $$
declare
  t text;
begin
  foreach t in array array[
    'employees',
    'employee_roles',
    'role_permissions',
    'roles',
    'permissions',
    'attendance',
    'salary_records',
    'salary_slips',
    'leave_requests',
    'work_policies',
    'meetings',
    'compliance_controls',
    'control_requirement_mappings',
    'evidence_items',
    'control_tests',
    'risks',
    'soa_entries',
    'corrective_actions',
    'control_exceptions',
    'onboarding_documents'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop trigger if exists trg_audit_%I on public.%I', t, t);
    execute format(
      'create trigger trg_audit_%I after insert or update or delete on public.%I for each row execute function public.log_audit_event()',
      t, t
    );
  end loop;
end $$;

drop trigger if exists trg_audit_app_settings on public.app_settings;
create trigger trg_audit_app_settings
  after insert or update or delete on public.app_settings
  for each row execute function public.log_audit_event_settings();

-- Snapshot live rows that never got an audit record_id entry.
do $$
declare
  r record;
  n int := 0;
begin
  if to_regclass('public.meetings') is not null then
    for r in
      select m.* from public.meetings m
      where not exists (
        select 1 from public.audit_logs a
        where a.table_name = 'meetings' and a.record_id = m.id
      )
    loop
      perform public.append_audit_log(
        'meetings', r.id, 'UPDATE_meetings', null, to_jsonb(r), null
      );
      n := n + 1;
    end loop;
  end if;

  if to_regclass('public.app_settings') is not null
     and not exists (select 1 from public.audit_logs where table_name = 'app_settings') then
    for r in select * from public.app_settings
    loop
      insert into public.audit_logs (
        actor_employee_id, action, table_name, record_id, old_data, new_data, actor_source
      ) values (
        null, 'UPDATE_app_settings', 'app_settings', null, null, to_jsonb(r), 'service_job'
      );
      n := n + 1;
    end loop;
  end if;

  raise notice 'audit snapshots appended: %', n;
end $$;

notify pgrst, 'reload schema';
