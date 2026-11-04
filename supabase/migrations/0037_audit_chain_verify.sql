-- Ensure tamper-evident audit hash chain + verify_audit_chain() exist.
-- Idempotent: safe if 0024 already applied; needed when 0024 was skipped on prod.

create or replace function public.current_request_role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    current_user::text
  );
$$;

create or replace function public.current_request_header(header_name text)
returns text
language sql
stable
as $$
  select nullif(current_setting('request.headers', true), '')::jsonb ->> lower(header_name);
$$;

create sequence if not exists public.audit_logs_chain_seq;

alter table public.audit_logs
  add column if not exists seq bigint,
  add column if not exists actor_source text,
  add column if not exists db_role text,
  add column if not exists request_id text,
  add column if not exists prev_hash text,
  add column if not exists row_hash text;

-- Number pre-existing rows (they stay outside the hash chain: row_hash null).
-- Must run before append-only trigger is attached.
update public.audit_logs a
set seq = numbered.n
from (
  select id, row_number() over (order by created_at, id) as n
  from public.audit_logs
  where seq is null
) numbered
where a.id = numbered.id;

select setval(
  'public.audit_logs_chain_seq',
  greatest((select coalesce(max(seq), 0) from public.audit_logs), 1),
  (select count(*) > 0 from public.audit_logs)
);

create unique index if not exists uq_audit_logs_seq on public.audit_logs(seq);

create or replace function public.audit_row_digest(
  p_prev_hash text,
  p_seq bigint,
  p_created_at timestamptz,
  p_actor uuid,
  p_action text,
  p_table text,
  p_record uuid,
  p_old jsonb,
  p_new jsonb,
  p_request_id text
)
returns text
language sql
immutable
as $$
  select encode(
    sha256(convert_to(
      coalesce(p_prev_hash, '') || '|' ||
      p_seq::text || '|' ||
      to_char(p_created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' ||
      coalesce(p_actor::text, '') || '|' ||
      coalesce(p_action, '') || '|' ||
      coalesce(p_table, '') || '|' ||
      coalesce(p_record::text, '') || '|' ||
      coalesce(p_old::text, '') || '|' ||
      coalesce(p_new::text, '') || '|' ||
      coalesce(p_request_id, ''),
      'UTF8'
    )),
    'hex'
  );
$$;

create or replace function public.audit_logs_seal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  last_hash text;
begin
  perform pg_advisory_xact_lock(hashtext('public.audit_logs.chain'));

  new.seq := nextval('public.audit_logs_chain_seq');
  new.created_at := now();
  new.db_role := public.current_request_role();
  new.request_id := coalesce(new.request_id, public.current_request_header('x-request-id'));
  new.actor_source := coalesce(
    new.actor_source,
    case
      when public.current_request_role() = 'service_role'
        and public.current_request_header('x-worktrack-actor') is not null then 'app_server'
      when public.current_request_role() = 'service_role' then 'service_job'
      when public.current_request_role() = 'authenticated' then 'api_user'
      else 'database'
    end
  );

  select row_hash into last_hash from public.audit_logs order by seq desc limit 1;
  new.prev_hash := last_hash;
  new.row_hash := public.audit_row_digest(
    new.prev_hash, new.seq, new.created_at, new.actor_employee_id, new.action,
    new.table_name, new.record_id, new.old_data, new.new_data, new.request_id
  );
  return new;
end;
$$;

drop trigger if exists trg_audit_logs_seal on public.audit_logs;
create trigger trg_audit_logs_seal
  before insert on public.audit_logs
  for each row execute function public.audit_logs_seal();

create or replace function public.audit_logs_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only (% blocked)', tg_op
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_audit_logs_no_update on public.audit_logs;
create trigger trg_audit_logs_no_update
  before update or delete on public.audit_logs
  for each row execute function public.audit_logs_append_only();

drop trigger if exists trg_audit_logs_no_truncate on public.audit_logs;
create trigger trg_audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function public.audit_logs_append_only();

revoke insert, update, delete, truncate on public.audit_logs from public, anon, authenticated, service_role;
revoke all on sequence public.audit_logs_chain_seq from public, anon, authenticated, service_role;
grant select on public.audit_logs to service_role;
grant select on public.audit_logs to authenticated;

-- Verifies the chain; returns the first broken link, or no rows if intact.
create or replace function public.verify_audit_chain(p_from_seq bigint default 1)
returns table (seq bigint, expected_hash text, stored_hash text, reason text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  prev text := null;
  expected text;
  first boolean := true;
begin
  for r in
    select a.* from public.audit_logs a
    where a.seq >= p_from_seq and a.row_hash is not null
    order by a.seq
  loop
    if first then
      prev := r.prev_hash;
      first := false;
    end if;
    if r.prev_hash is distinct from prev then
      seq := r.seq; expected_hash := prev; stored_hash := r.prev_hash; reason := 'prev_hash mismatch (row removed or reordered)';
      return next; return;
    end if;
    expected := public.audit_row_digest(
      r.prev_hash, r.seq, r.created_at, r.actor_employee_id, r.action,
      r.table_name, r.record_id, r.old_data, r.new_data, r.request_id
    );
    if expected <> r.row_hash then
      seq := r.seq; expected_hash := expected; stored_hash := r.row_hash; reason := 'row content changed';
      return next; return;
    end if;
    prev := r.row_hash;
  end loop;
end;
$$;

revoke execute on function public.verify_audit_chain(bigint) from public, anon, authenticated;
grant execute on function public.verify_audit_chain(bigint) to service_role;

-- Keep audit coverage for sensitive tables (idempotent).
drop trigger if exists trg_audit_attendance on public.attendance;
create trigger trg_audit_attendance
  after insert or update or delete on public.attendance
  for each row execute function public.log_audit_event();

drop trigger if exists trg_audit_roles on public.roles;
create trigger trg_audit_roles
  after insert or update or delete on public.roles
  for each row execute function public.log_audit_event();

drop trigger if exists trg_audit_permissions on public.permissions;
create trigger trg_audit_permissions
  after insert or update or delete on public.permissions
  for each row execute function public.log_audit_event();

notify pgrst, 'reload schema';
