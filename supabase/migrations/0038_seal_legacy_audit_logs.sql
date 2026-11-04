-- Backfill SHA-256 seals for every audit row (legacy + any already-sealed tip).
-- Recomputes the whole chain in seq order so the tip stays consistent.
-- Temporarily allows updates, then locks the table again.

create or replace function public.seal_legacy_audit_logs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  prev text := null;
  sealed int := 0;
  digest text;
begin
  -- Allow this one-time update past the append-only trigger.
  alter table public.audit_logs disable trigger trg_audit_logs_no_update;

  for r in
    select id, seq, created_at, actor_employee_id, action, table_name, record_id,
           old_data, new_data, request_id
    from public.audit_logs
    where seq is not null
    order by seq
  loop
    digest := public.audit_row_digest(
      prev,
      r.seq,
      r.created_at,
      r.actor_employee_id,
      r.action,
      r.table_name,
      r.record_id,
      r.old_data,
      r.new_data,
      r.request_id
    );

    update public.audit_logs
    set prev_hash = prev,
        row_hash = digest
    where id = r.id;

    prev := digest;
    sealed := sealed + 1;
  end loop;
   
  alter table public.audit_logs enable trigger trg_audit_logs_no_update;
  return sealed;
exception
  when others then
    alter table public.audit_logs enable trigger trg_audit_logs_no_update;
    raise;
end;
$$;

revoke execute on function public.seal_legacy_audit_logs() from public, anon, authenticated;
grant execute on function public.seal_legacy_audit_logs() to service_role;

-- Run once.
select public.seal_legacy_audit_logs() as sealed_rows;

notify pgrst, 'reload schema';
