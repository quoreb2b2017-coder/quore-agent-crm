-- 0028_mfa_and_audit_coverage.sql
-- * has_verified_mfa(): lets the server check, without trusting the browser
--   cookie, whether a user has a verified second factor (ISO A.8.5, SOC 2 CC6.1).
-- * Audit coverage for the onboarding tables added in 0022/0023. Identity and
--   bank numbers are redacted before they reach the append-only audit log,
--   because audit rows can never be erased (ISO A.5.34, A.8.11).

create or replace function public.has_verified_mfa(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  found boolean := false;
begin
  if to_regclass('auth.mfa_factors') is null then
    return false;
  end if;
  execute 'select exists (select 1 from auth.mfa_factors where user_id = $1 and status = ''verified'')'
    into found
    using p_user_id;
  return found;
end;
$$;

revoke execute on function public.has_verified_mfa(uuid) from public, anon, authenticated;
grant execute on function public.has_verified_mfa(uuid) to service_role;

create or replace function public.redact_onboarding(p jsonb)
returns jsonb
language sql
immutable
as $$
  select case when p is null then null else
    (p - 'pan_number' - 'aadhaar_number' - 'bank_account_number')
    || jsonb_build_object(
      'pan_number', case when p->>'pan_number' is null then null else '***' || right(p->>'pan_number', 2) end,
      'aadhaar_number', case when p->>'aadhaar_number' is null then null else '***' || right(p->>'aadhaar_number', 4) end,
      'bank_account_number', case when p->>'bank_account_number' is null then null else '***' || right(p->>'bank_account_number', 4) end
    )
  end;
$$;

create or replace function public.log_audit_event_onboarding()
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
    coalesce(new.employee_id, old.employee_id),
    case when tg_op in ('UPDATE', 'DELETE') then public.redact_onboarding(to_jsonb(old)) else null end,
    case when tg_op in ('UPDATE', 'INSERT') then public.redact_onboarding(to_jsonb(new)) else null end
  );
  return coalesce(new, old);
end;
$$;

do $$
begin
  if to_regclass('public.employee_onboarding') is not null then
    execute 'drop trigger if exists trg_audit_employee_onboarding on public.employee_onboarding';
    execute 'create trigger trg_audit_employee_onboarding after insert or update or delete on public.employee_onboarding for each row execute function public.log_audit_event_onboarding()';
  end if;
  if to_regclass('public.onboarding_documents') is not null then
    execute 'drop trigger if exists trg_audit_onboarding_documents on public.onboarding_documents';
    execute 'create trigger trg_audit_onboarding_documents after insert or update or delete on public.onboarding_documents for each row execute function public.log_audit_event()';
  end if;
end $$;

-- Security events that do not change a public table (for example a Super Admin
-- resetting someone's second factor) still belong in the hash-chained log.
create or replace function public.log_security_event(p_employee_id uuid, p_action text, p_details jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_action !~ '^[A-Z_]{3,60}$' then
    raise exception 'invalid security event name' using errcode = '22023';
  end if;
  insert into public.audit_logs (actor_employee_id, action, table_name, record_id, old_data, new_data)
  values (public.current_employee_id(), 'SECURITY_' || p_action, 'security_events', p_employee_id, null, coalesce(p_details, '{}'::jsonb));
end;
$$;

revoke execute on function public.log_security_event(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.log_security_event(uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';
