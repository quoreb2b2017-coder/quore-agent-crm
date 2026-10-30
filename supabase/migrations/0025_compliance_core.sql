-- 0025_compliance_core.sql
-- Compliance data model, phase C MVP: frameworks and requirements, the
-- control register with ISO 27001:2022 / SOC 2 crosswalk, evidence, control
-- tests, exceptions, risk register, Statement of Applicability and corrective
-- actions.
--
-- Design rules (from the WorkTrack compliance master prompt):
-- * A mapping or a status flag never proves a control. A control can only be
--   set to OPERATING_EVIDENCED when accepted, in-period evidence AND a passing
--   test exist (enforced in the database, not the UI).
-- * Evidence and test records are append-only. Only review fields change, and
--   the reviewer must differ from the collector.
-- * Every change is written to audit_logs (hash-chained, see 0022).
-- * Access is separate from HR administration: compliance.* permissions.

-- ============================================================
-- permissions
-- ============================================================

insert into public.permissions (permission_key, description, category) values
  ('compliance.view', 'View the Security & Compliance center', 'Compliance'),
  ('compliance.manage', 'Edit controls, risks, evidence and the Statement of Applicability', 'Compliance'),
  ('compliance.audit', 'Read-only auditor access to compliance records and exports', 'Compliance')
on conflict (permission_key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.permission_key in ('compliance.view', 'compliance.manage')
where r.role_key = 'SUPER_ADMIN'
on conflict (role_id, permission_id) do nothing;

create or replace function public.can_view_compliance()
returns boolean
language sql
stable
as $$
  select public.has_permission('compliance.view') or public.has_permission('compliance.audit');
$$;

-- ============================================================
-- frameworks and requirements
-- ============================================================

create table if not exists public.compliance_frameworks (
  id uuid primary key default gen_random_uuid(),
  framework_key text not null unique,
  name text not null,
  version text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.framework_requirements (
  id uuid primary key default gen_random_uuid(),
  framework_id uuid not null references public.compliance_frameworks(id) on delete cascade,
  ref text not null,
  title text not null,
  category text,
  created_at timestamptz not null default now(),
  unique (framework_id, ref)
);

-- ============================================================
-- control register
-- ============================================================

create table if not exists public.compliance_controls (
  id uuid primary key default gen_random_uuid(),
  control_code text not null unique,
  title text not null,
  description text not null,
  objective text,
  domain text not null,
  owner_role text,
  owner_employee_id uuid references public.employees(id) on delete set null,
  frequency text not null default 'EVENT_DRIVEN'
    check (frequency in ('CONTINUOUS', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'EVENT_DRIVEN')),
  control_type text not null default 'PREVENTIVE'
    check (control_type in ('PREVENTIVE', 'DETECTIVE', 'CORRECTIVE', 'SUPPORTING')),
  execution_mode text not null default 'MANUAL'
    check (execution_mode in ('MANUAL', 'AUTOMATED', 'HYBRID')),
  scope_layer text not null default 'WORKTRACK'
    check (scope_layer in ('WORKTRACK', 'ORGANIZATION', 'INFRASTRUCTURE', 'SHARED')),
  status text not null default 'NOT_ASSESSED'
    check (status in (
      'NOT_ASSESSED', 'NOT_IMPLEMENTED', 'IN_PROGRESS', 'IMPLEMENTED_AWAITING_EVIDENCE',
      'OPERATING_EVIDENCED', 'EXCEPTION_IDENTIFIED', 'REMEDIATION_REQUIRED',
      'RISK_ACCEPTED', 'NOT_APPLICABLE'
    )),
  applicability_rationale text,
  current_state text,
  gap_remediation text,
  evidence_required text,
  test_procedure text,
  priority text check (priority in ('P0', 'P1', 'P2', 'P3')),
  next_due_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.control_requirement_mappings (
  id uuid primary key default gen_random_uuid(),
  control_id uuid not null references public.compliance_controls(id) on delete cascade,
  requirement_id uuid not null references public.framework_requirements(id) on delete cascade,
  mapping_note text,
  created_at timestamptz not null default now(),
  unique (control_id, requirement_id)
);

create index if not exists idx_crm_requirement on public.control_requirement_mappings(requirement_id);

-- ============================================================
-- evidence (append-only content; review fields only)
-- ============================================================

create table if not exists public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  control_id uuid not null references public.compliance_controls(id) on delete restrict,
  title text not null,
  evidence_type text not null
    check (evidence_type in ('SYSTEM_EXPORT', 'AUTOMATED_TEST', 'SCREENSHOT', 'DOCUMENT', 'TICKET', 'LOG_EXTRACT', 'ATTESTATION')),
  collection_method text not null
    check (collection_method in ('AUTOMATED', 'MANUAL_UPLOAD', 'SYSTEM_EXPORT')),
  source_system text not null,
  source_record_id text,
  collected_at timestamptz not null default now(),
  period_start date,
  period_end date,
  collected_by uuid references public.employees(id) on delete set null,
  storage_path text,
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  limitations text,
  retention_class text not null default 'AUDIT_7Y',
  status text not null default 'PENDING_REVIEW'
    check (status in ('PENDING_REVIEW', 'ACCEPTED', 'REJECTED', 'SUPERSEDED', 'EXPIRED')),
  reviewed_by uuid references public.employees(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  supersedes_id uuid references public.evidence_items(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint evidence_period_ok check (period_end is null or period_start is null or period_end >= period_start),
  constraint evidence_reviewer_independent check (reviewed_by is null or collected_by is null or reviewed_by <> collected_by),
  constraint evidence_review_complete check (
    (status in ('ACCEPTED', 'REJECTED') and reviewed_by is not null and reviewed_at is not null)
    or status not in ('ACCEPTED', 'REJECTED')
  )
);

create index if not exists idx_evidence_control on public.evidence_items(control_id, collected_at desc);

-- ============================================================
-- control tests / executions (append-only)
-- ============================================================

create table if not exists public.control_tests (
  id uuid primary key default gen_random_uuid(),
  control_id uuid not null references public.compliance_controls(id) on delete restrict,
  executed_at timestamptz not null default now(),
  executed_by uuid references public.employees(id) on delete set null,
  execution_identity text not null,
  method text not null
    check (method in ('AUTOMATED', 'INSPECTION', 'REPERFORMANCE', 'INQUIRY', 'OBSERVATION')),
  rule_version text,
  population jsonb not null default '{}'::jsonb,
  result text not null
    check (result in ('PASS', 'FAIL', 'PARTIAL', 'COLLECTION_FAILED')),
  exceptions jsonb not null default '[]'::jsonb,
  exceptions_count int generated always as (jsonb_array_length(exceptions)) stored,
  notes text,
  evidence_id uuid references public.evidence_items(id) on delete restrict,
  is_independent boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_control_tests_control on public.control_tests(control_id, executed_at desc);

-- ============================================================
-- exceptions (SoD and other approved deviations)
-- ============================================================

create table if not exists public.control_exceptions (
  id uuid primary key default gen_random_uuid(),
  control_id uuid references public.compliance_controls(id) on delete restrict,
  kind text not null check (kind in ('SEGREGATION_OF_DUTIES', 'POLICY', 'CONTROL_FAILURE', 'TECHNICAL')),
  description text not null,
  compensating_control text,
  requested_by uuid references public.employees(id) on delete set null,
  approved_by uuid references public.employees(id) on delete set null,
  approved_at timestamptz,
  expires_at date,
  status text not null default 'REQUESTED'
    check (status in ('REQUESTED', 'APPROVED', 'REJECTED', 'EXPIRED', 'CLOSED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint control_exceptions_independent_approval check (approved_by is null or requested_by is null or approved_by <> requested_by),
  constraint control_exceptions_approval_complete check (
    status <> 'APPROVED' or (approved_by is not null and approved_at is not null and compensating_control is not null and expires_at is not null)
  )
);

-- ============================================================
-- risk register
-- ============================================================

create table if not exists public.risks (
  id uuid primary key default gen_random_uuid(),
  risk_code text not null unique,
  title text not null,
  description text,
  asset text,
  threat text,
  vulnerability text,
  impacts_confidentiality boolean not null default false,
  impacts_integrity boolean not null default false,
  impacts_availability boolean not null default false,
  likelihood int check (likelihood between 1 and 5),
  impact int check (impact between 1 and 5),
  inherent_score int generated always as (likelihood * impact) stored,
  residual_likelihood int check (residual_likelihood between 1 and 5),
  residual_impact int check (residual_impact between 1 and 5),
  residual_score int generated always as (residual_likelihood * residual_impact) stored,
  treatment text check (treatment in ('MITIGATE', 'AVOID', 'TRANSFER', 'ACCEPT')),
  treatment_plan text,
  owner_employee_id uuid references public.employees(id) on delete set null,
  due_date date,
  acceptance_approved_by uuid references public.employees(id) on delete set null,
  acceptance_approved_at timestamptz,
  acceptance_expires_at date,
  status text not null default 'IDENTIFIED'
    check (status in ('IDENTIFIED', 'ASSESSED', 'TREATMENT_IN_PROGRESS', 'TREATED', 'ACCEPTED', 'CLOSED')),
  next_review_date date,
  methodology_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint risks_acceptance_complete check (
    status <> 'ACCEPTED' or (treatment = 'ACCEPT' and acceptance_approved_by is not null and acceptance_approved_at is not null and acceptance_expires_at is not null)
  ),
  constraint risks_acceptance_by_other check (acceptance_approved_by is null or owner_employee_id is null or acceptance_approved_by <> owner_employee_id)
);

create table if not exists public.risk_control_links (
  risk_id uuid not null references public.risks(id) on delete cascade,
  control_id uuid not null references public.compliance_controls(id) on delete cascade,
  primary key (risk_id, control_id)
);

-- ============================================================
-- Statement of Applicability (ISO 27001 Annex A)
-- ============================================================

create table if not exists public.soa_entries (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null unique references public.framework_requirements(id) on delete restrict,
  applicable boolean,
  justification text,
  implementation_status text not null default 'NOT_ASSESSED'
    check (implementation_status in ('NOT_ASSESSED', 'NOT_IMPLEMENTED', 'PARTIAL', 'IMPLEMENTED')),
  revision int not null default 1,
  approved_by uuid references public.employees(id) on delete set null,
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint soa_decision_justified check (applicable is null or (justification is not null and char_length(btrim(justification)) > 0))
);

-- ============================================================
-- corrective actions
-- ============================================================

create table if not exists public.corrective_actions (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  source_type text not null check (source_type in ('SECURITY_FINDING', 'CONTROL_TEST', 'INTERNAL_AUDIT', 'INCIDENT', 'RISK', 'EXTERNAL_AUDIT')),
  source_ref text,
  control_id uuid references public.compliance_controls(id) on delete set null,
  title text not null,
  description text,
  severity text check (severity in ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  owner_employee_id uuid references public.employees(id) on delete set null,
  due_date date,
  status text not null default 'OPEN'
    check (status in ('OPEN', 'IN_PROGRESS', 'READY_FOR_VERIFICATION', 'CLOSED', 'RISK_ACCEPTED')),
  closure_evidence_id uuid references public.evidence_items(id) on delete restrict,
  closed_by uuid references public.employees(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint corrective_actions_closure_evidenced check (
    status <> 'CLOSED' or (closure_evidence_id is not null and closed_by is not null and closed_at is not null)
  )
);

-- ============================================================
-- integrity triggers
-- ============================================================

drop trigger if exists trg_compliance_controls_updated_at on public.compliance_controls;
create trigger trg_compliance_controls_updated_at
  before update on public.compliance_controls
  for each row execute function public.set_updated_at();

drop trigger if exists trg_control_exceptions_updated_at on public.control_exceptions;
create trigger trg_control_exceptions_updated_at
  before update on public.control_exceptions
  for each row execute function public.set_updated_at();

drop trigger if exists trg_risks_updated_at on public.risks;
create trigger trg_risks_updated_at
  before update on public.risks
  for each row execute function public.set_updated_at();

drop trigger if exists trg_soa_updated_at on public.soa_entries;
create trigger trg_soa_updated_at
  before update on public.soa_entries
  for each row execute function public.set_updated_at();

drop trigger if exists trg_corrective_actions_updated_at on public.corrective_actions;
create trigger trg_corrective_actions_updated_at
  before update on public.corrective_actions
  for each row execute function public.set_updated_at();

-- Status gate: a control is only "operating and evidenced" with proof.
create or replace function public.compliance_controls_status_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  has_evidence boolean;
  has_pass boolean;
begin
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
    if new.status is not distinct from old.status
       and new.applicability_rationale is not distinct from old.applicability_rationale then
      return new;
    end if;
  end if;

  if new.status = 'OPERATING_EVIDENCED' then
    select exists (
      select 1 from public.evidence_items e
      where e.control_id = new.id
        and e.status = 'ACCEPTED'
        and coalesce(e.period_end, e.collected_at::date) >= current_date - 365
    ) into has_evidence;

    select exists (
      select 1 from public.control_tests t
      where t.control_id = new.id
        and t.result = 'PASS'
        and t.executed_at >= now() - interval '365 days'
        and t.executed_at = (
          select max(t2.executed_at) from public.control_tests t2 where t2.control_id = new.id
        )
    ) into has_pass;

    if not has_evidence then
      raise exception 'Control % cannot be OPERATING_EVIDENCED without accepted evidence from the last 12 months', new.control_code
        using errcode = '23514';
    end if;
    if not has_pass then
      raise exception 'Control % cannot be OPERATING_EVIDENCED unless its latest control test passed', new.control_code
        using errcode = '23514';
    end if;
  end if;

  if new.status = 'NOT_APPLICABLE'
     and (new.applicability_rationale is null or char_length(btrim(new.applicability_rationale)) < 20) then
    raise exception 'Control % needs an applicability rationale (20+ characters) to be NOT_APPLICABLE', new.control_code
      using errcode = '23514';
  end if;

  if new.status = 'RISK_ACCEPTED' and not exists (
    select 1 from public.risk_control_links l
    join public.risks r on r.id = l.risk_id
    where l.control_id = new.id
      and r.status = 'ACCEPTED'
      and r.acceptance_expires_at >= current_date
  ) then
    raise exception 'Control % needs a linked, approved and unexpired risk acceptance', new.control_code
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_compliance_controls_status_gate on public.compliance_controls;
create trigger trg_compliance_controls_status_gate
  before insert or update on public.compliance_controls
  for each row execute function public.compliance_controls_status_gate();

-- A failing test pulls an "operating" control back to EXCEPTION_IDENTIFIED.
create or replace function public.control_tests_apply_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.result in ('FAIL', 'PARTIAL', 'COLLECTION_FAILED') then
    update public.compliance_controls
    set status = 'EXCEPTION_IDENTIFIED'
    where id = new.control_id
      and status in ('OPERATING_EVIDENCED', 'IMPLEMENTED_AWAITING_EVIDENCE');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_control_tests_apply_result on public.control_tests;
create trigger trg_control_tests_apply_result
  after insert on public.control_tests
  for each row execute function public.control_tests_apply_result();

-- Independence is computed, never claimed: the executor must not own the control.
create or replace function public.control_tests_set_independence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  select owner_employee_id into owner_id from public.compliance_controls where id = new.control_id;
  new.executed_at := now();
  new.is_independent := new.executed_by is not null
    and owner_id is not null
    and new.executed_by <> owner_id;
  return new;
end;
$$;

drop trigger if exists trg_control_tests_independence on public.control_tests;
create trigger trg_control_tests_independence
  before insert on public.control_tests
  for each row execute function public.control_tests_set_independence();

create or replace function public.block_modification()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only (% blocked)', tg_table_name, tg_op
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_control_tests_append_only on public.control_tests;
create trigger trg_control_tests_append_only
  before update or delete on public.control_tests
  for each row execute function public.block_modification();

-- Evidence content is immutable; only status and review fields may change,
-- and only forward (PENDING_REVIEW -> ACCEPTED/REJECTED -> SUPERSEDED/EXPIRED).
create or replace function public.evidence_items_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'evidence_items cannot be deleted; supersede or expire it instead'
      using errcode = '42501';
  end if;

  if (new.control_id, new.title, new.evidence_type, new.collection_method, new.source_system,
      new.source_record_id, new.collected_at, new.period_start, new.period_end, new.collected_by,
      new.storage_path, new.sha256, new.limitations, new.retention_class, new.supersedes_id, new.created_at)
     is distinct from
     (old.control_id, old.title, old.evidence_type, old.collection_method, old.source_system,
      old.source_record_id, old.collected_at, old.period_start, old.period_end, old.collected_by,
      old.storage_path, old.sha256, old.limitations, old.retention_class, old.supersedes_id, old.created_at) then
    raise exception 'evidence content is immutable; add a new evidence item that supersedes this one'
      using errcode = '42501';
  end if;

  if old.status in ('SUPERSEDED', 'EXPIRED') then
    raise exception 'evidence in status % is closed', old.status using errcode = '42501';
  end if;
  if old.status in ('ACCEPTED', 'REJECTED') and new.status not in ('SUPERSEDED', 'EXPIRED', old.status) then
    raise exception 'reviewed evidence can only be superseded or expired' using errcode = '42501';
  end if;
  if old.status in ('ACCEPTED', 'REJECTED') and new.status = old.status
     and (new.reviewed_by, new.reviewed_at, new.review_note) is distinct from (old.reviewed_by, old.reviewed_at, old.review_note) then
    raise exception 'a completed review cannot be rewritten' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_evidence_items_guard on public.evidence_items;
create trigger trg_evidence_items_guard
  before update or delete on public.evidence_items
  for each row execute function public.evidence_items_guard();

-- Change history for every compliance table goes to the hash-chained audit log.
do $$
declare
  t text;
begin
  foreach t in array array[
    'compliance_controls', 'control_requirement_mappings', 'evidence_items', 'control_tests',
    'control_exceptions', 'risks', 'soa_entries', 'corrective_actions'
  ]
  loop
    execute format('drop trigger if exists trg_audit_%1$s on public.%1$I', t);
    execute format(
      'create trigger trg_audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.log_audit_event()',
      t
    );
  end loop;
end $$;

-- ============================================================
-- RLS (dedicated compliance permissions, separate from HR admin)
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'compliance_frameworks', 'framework_requirements', 'compliance_controls',
    'control_requirement_mappings', 'evidence_items', 'control_tests', 'control_exceptions',
    'risks', 'risk_control_links', 'soa_entries', 'corrective_actions'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke truncate on public.%I from authenticated, service_role', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('grant select, insert, update on public.%I to service_role', t);

    execute format('drop policy if exists %1$s_select on public.%1$I', t);
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated using (public.can_view_compliance())',
      t
    );
    execute format('drop policy if exists %1$s_insert on public.%1$I', t);
    execute format(
      'create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.has_permission(''compliance.manage''))',
      t
    );
    execute format('drop policy if exists %1$s_update on public.%1$I', t);
    execute format(
      'create policy %1$s_update on public.%1$I for update to authenticated using (public.has_permission(''compliance.manage'')) with check (public.has_permission(''compliance.manage''))',
      t
    );
  end loop;
end $$;

-- Deleting compliance records is not an API operation.
revoke delete on public.compliance_frameworks, public.framework_requirements, public.compliance_controls,
  public.evidence_items, public.control_tests, public.control_exceptions, public.risks,
  public.soa_entries, public.corrective_actions
  from authenticated, service_role;
grant delete on public.control_requirement_mappings, public.risk_control_links to authenticated, service_role;

drop policy if exists control_requirement_mappings_delete on public.control_requirement_mappings;
create policy control_requirement_mappings_delete on public.control_requirement_mappings
  for delete to authenticated using (public.has_permission('compliance.manage'));
drop policy if exists risk_control_links_delete on public.risk_control_links;
create policy risk_control_links_delete on public.risk_control_links
  for delete to authenticated using (public.has_permission('compliance.manage'));

-- Evidence review: the reviewer is always the signed-in caller.
create or replace function public.evidence_items_stamp_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('ACCEPTED', 'REJECTED') and old.status = 'PENDING_REVIEW' then
    new.reviewed_by := coalesce(public.current_employee_id(), new.reviewed_by);
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_evidence_items_stamp_review on public.evidence_items;
create trigger trg_evidence_items_stamp_review
  before update on public.evidence_items
  for each row execute function public.evidence_items_stamp_review();

-- ============================================================
-- private evidence storage bucket
-- ============================================================

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('compliance-evidence', 'compliance-evidence', false, 26214400)
    on conflict (id) do update set public = false;
  end if;
end $$;

do $$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists compliance_evidence_select on storage.objects';
    execute $p$
      create policy compliance_evidence_select on storage.objects
        for select to authenticated
        using (bucket_id = 'compliance-evidence' and public.can_view_compliance())
    $p$;
    execute 'drop policy if exists compliance_evidence_insert on storage.objects';
    execute $p$
      create policy compliance_evidence_insert on storage.objects
        for insert to authenticated
        with check (bucket_id = 'compliance-evidence' and public.has_permission('compliance.manage'))
    $p$;
  end if;
end $$;

notify pgrst, 'reload schema';
