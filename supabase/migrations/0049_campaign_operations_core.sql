-- 0049_campaign_operations_core.sql
-- Campaign Operations, phase 2: campaigns, campaign membership, the file repository and
-- the database repository (upload -> quarantine -> scan -> validate -> approve -> publish).
-- Replaces the Quore_Database share. See docs/campaigns/README.md.
--
-- Rules the database enforces, whoever calls it:
--   * Nothing here is reachable from the public API: anon and authenticated have no grants.
--     The Next.js server checks the caller, then uses the service role (same model as
--     salary_change_requests, 0043).
--   * A database version can only be approved or rejected by someone other than its uploader.
--   * Versions move only forward (no jump from validating to published).
--   * Campaigns move only along the allowed status path.
--   * Campaigns, files and database versions are never deleted; they are archived.
--   * A stored file's hash, path and size never change once recorded.
-- Safe to re-run.

-- ============================================================
-- 1. Permissions and the Operations Manager role
-- ============================================================

insert into public.permissions (permission_key, description, category) values
  ('co.campaign.view', 'See campaigns (all, or only those you are a member of)', 'Campaign Operations'),
  ('co.campaign.manage', 'Create and edit campaigns, manage members, hold and archive', 'Campaign Operations'),
  ('co.database.upload', 'Upload campaign databases to quarantine for the campaigns you belong to', 'Campaign Operations'),
  ('co.database.approve', 'Approve or reject a validated database (never your own upload)', 'Campaign Operations'),
  ('co.database.download', 'Download full campaign database files', 'Campaign Operations'),
  ('co.documents.manage', 'Upload and archive campaign documents (scripts, SOPs, reports)', 'Campaign Operations')
on conflict (permission_key) do update set description = excluded.description, category = excluded.category;

insert into public.roles (role_key, display_name, description, is_system, department_kind)
select 'OPS_MANAGER', 'Operations Manager', 'Runs campaigns: creates them, approves databases and oversees production', true, 'SALES'
where not exists (select 1 from public.roles where role_key = 'OPS_MANAGER');

with grants (role_key, permission_key) as (
  values
    ('SUPER_ADMIN', 'co.campaign.view'), ('SUPER_ADMIN', 'co.campaign.manage'),
    ('SUPER_ADMIN', 'co.database.upload'), ('SUPER_ADMIN', 'co.database.approve'),
    ('SUPER_ADMIN', 'co.database.download'), ('SUPER_ADMIN', 'co.documents.manage'),
    ('OPS_MANAGER', 'co.campaign.view'), ('OPS_MANAGER', 'co.campaign.manage'),
    ('OPS_MANAGER', 'co.database.approve'), ('OPS_MANAGER', 'co.documents.manage'),
    ('OPS_MANAGER', 'attendance.view'), ('OPS_MANAGER', 'activity.view'),
    ('OPS_MANAGER', 'leave.view'), ('OPS_MANAGER', 'leave.apply'),
    ('DATABASE', 'co.campaign.view'), ('DATABASE', 'co.database.upload'),
    ('DATABASE', 'co.database.download')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from grants g
join public.roles r on r.role_key = g.role_key
join public.permissions p on p.permission_key = g.permission_key
on conflict do nothing;

-- ============================================================
-- 2. Campaigns and membership
-- ============================================================

create sequence if not exists public.co_campaign_code_seq;

create table if not exists public.co_campaigns (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    default ('CMP-' || to_char(now() at time zone 'UTC', 'YYYY') || '-' || lpad(nextval('public.co_campaign_code_seq')::text, 4, '0')),
  name text not null check (length(trim(name)) between 2 and 160),
  client_name text,
  advertiser text,
  description text,
  instructions text,
  geography text[] not null default '{}',
  industries text[] not null default '{}',
  job_titles text[] not null default '{}',
  starts_on date,
  ends_on date,
  manager_id uuid references public.employees (id) on delete set null,
  -- Columns every row of this campaign's database must have, besides an email or a phone.
  required_fields text[] not null default array['full_name', 'company']::text[],
  status text not null default 'DRAFT' check (status in (
    'DRAFT', 'AWAITING_DATABASE', 'DATABASE_VALIDATION', 'AWAITING_APPROVAL', 'READY_FOR_DISTRIBUTION',
    'IN_PRODUCTION', 'ON_HOLD', 'QC_IN_PROGRESS', 'COMPLETED', 'ARCHIVED'
  )),
  held_from text,
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint co_campaigns_dates check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint co_campaigns_required_fields check (
    required_fields <@ array['full_name', 'first_name', 'last_name', 'company', 'job_title', 'country', 'email', 'phone']::text[]
  )
);

create index if not exists idx_co_campaigns_status on public.co_campaigns (status);
create index if not exists idx_co_campaigns_manager on public.co_campaigns (manager_id);

drop trigger if exists trg_co_campaigns_updated_at on public.co_campaigns;
create trigger trg_co_campaigns_updated_at
  before update on public.co_campaigns
  for each row execute function public.set_updated_at();

create table if not exists public.co_campaign_members (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.co_campaigns (id) on delete restrict,
  employee_id uuid not null references public.employees (id) on delete restrict,
  member_role text not null check (member_role in ('MANAGER', 'DATABASE', 'PRODUCTION', 'CALLER', 'QA')),
  added_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references public.employees (id) on delete set null
);

create unique index if not exists uq_co_members_active
  on public.co_campaign_members (campaign_id, employee_id, member_role)
  where ended_at is null;
create index if not exists idx_co_members_employee on public.co_campaign_members (employee_id) where ended_at is null;

-- Campaign status path. ON_HOLD returns to where it came from (held_from).
create or replace function public.co_campaign_status_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  allowed text[];
begin
  if tg_op <> 'UPDATE' or new.status = old.status then
    return new;
  end if;

  if old.status = 'ARCHIVED' then
    raise exception 'An archived campaign cannot change status.' using errcode = 'check_violation';
  end if;

  if new.status = 'ON_HOLD' then
    if old.status in ('COMPLETED') then
      raise exception 'A completed campaign cannot be put on hold.' using errcode = 'check_violation';
    end if;
    new.held_from := old.status;
    return new;
  end if;

  if old.status = 'ON_HOLD' then
    if new.status <> coalesce(old.held_from, 'DRAFT') and new.status <> 'ARCHIVED' then
      raise exception 'A held campaign resumes to %, not %.', coalesce(old.held_from, 'DRAFT'), new.status
        using errcode = 'check_violation';
    end if;
    new.held_from := null;
    return new;
  end if;

  allowed := case old.status
    when 'DRAFT' then array['AWAITING_DATABASE', 'DATABASE_VALIDATION', 'ARCHIVED']
    when 'AWAITING_DATABASE' then array['DRAFT', 'DATABASE_VALIDATION', 'ARCHIVED']
    when 'DATABASE_VALIDATION' then array['AWAITING_DATABASE', 'AWAITING_APPROVAL', 'ARCHIVED']
    when 'AWAITING_APPROVAL' then array['AWAITING_DATABASE', 'DATABASE_VALIDATION', 'READY_FOR_DISTRIBUTION', 'ARCHIVED']
    when 'READY_FOR_DISTRIBUTION' then array['IN_PRODUCTION', 'COMPLETED', 'ARCHIVED']
    when 'IN_PRODUCTION' then array['QC_IN_PROGRESS', 'COMPLETED']
    when 'QC_IN_PROGRESS' then array['IN_PRODUCTION', 'COMPLETED']
    when 'COMPLETED' then array['IN_PRODUCTION', 'ARCHIVED']
    else array[]::text[]
  end;

  if not (new.status = any (allowed)) then
    raise exception 'A campaign cannot move from % to %.', old.status, new.status using errcode = 'check_violation';
  end if;

  if new.status = 'ARCHIVED' then
    new.archived_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_co_campaign_status_guard on public.co_campaigns;
create trigger trg_co_campaign_status_guard
  before update on public.co_campaigns
  for each row execute function public.co_campaign_status_guard();

-- ============================================================
-- 3. File categories and the file repository
-- ============================================================

create table if not exists public.co_file_categories (
  key text primary key,
  label text not null,
  description text,
  -- Database files go through validation and a second-person approval before publication.
  is_database boolean not null default false,
  -- Campaign member roles that may open a published file of this category.
  member_roles text[] not null default '{}',
  sort_order int not null default 100,
  retired boolean not null default false
);

insert into public.co_file_categories (key, label, description, is_database, member_roles, sort_order) values
  ('RAW_DATABASE', 'Raw database', 'Database as received or built, before validation', true, array['MANAGER', 'DATABASE'], 10),
  ('VALIDATED_DATABASE', 'Validated database', 'Database after cleaning and validation', true, array['MANAGER', 'DATABASE'], 20),
  ('PRODUCTION_DATABASE', 'Approved production database', 'Database approved for distribution to production', true, array['MANAGER', 'DATABASE'], 30),
  ('INSTRUCTIONS', 'Campaign instructions', 'Client brief and campaign instructions', false, array['MANAGER', 'DATABASE', 'PRODUCTION', 'CALLER', 'QA'], 40),
  ('SCRIPT', 'Calling script', 'Scripts used by the calling team', false, array['MANAGER', 'PRODUCTION', 'CALLER', 'QA'], 50),
  ('SOP', 'SOP document', 'Standard operating procedures for this campaign', false, array['MANAGER', 'DATABASE', 'PRODUCTION', 'CALLER', 'QA'], 60),
  ('PRODUCTION_REPORT', 'Production report', 'Production progress and output reports', false, array['MANAGER', 'PRODUCTION'], 70),
  ('QC_REPORT', 'QC report', 'Quality control reports', false, array['MANAGER', 'QA'], 80),
  ('RECORDING_REFERENCE', 'Call recording reference', 'A secure reference to call recordings, not the audio itself', false, array['MANAGER', 'QA'], 90),
  ('CLIENT_REPORT', 'Final client report', 'Reports delivered to the client', false, array['MANAGER'], 100),
  ('SUPPORTING', 'Supporting document', 'Anything else that belongs to the campaign', false, array['MANAGER', 'DATABASE', 'PRODUCTION', 'QA'], 110)
on conflict (key) do nothing;

create table if not exists public.co_files (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.co_campaigns (id) on delete restrict,
  category_key text not null references public.co_file_categories (key),
  title text not null check (length(trim(title)) between 1 and 200),
  original_name text not null,
  extension text not null,
  size_bytes bigint not null check (size_bytes > 0),
  mime_type text,
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  bucket text not null default 'co-quarantine' check (bucket in ('co-quarantine', 'co-approved')),
  storage_path text not null,
  version int not null default 1 check (version > 0),
  supersedes_id uuid references public.co_files (id),
  status text not null default 'UPLOADING' check (status in (
    'UPLOADING', 'QUARANTINED', 'SCANNING', 'INFECTED', 'SCAN_FAILED', 'CLEAN',
    'PUBLISHING', 'PUBLISHED', 'REJECTED', 'ARCHIVED'
  )),
  scan_result text,
  scan_attempts int not null default 0,
  scanned_at timestamptz,
  published_at timestamptz,
  uploaded_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.employees (id) on delete set null,
  constraint co_files_extension check (extension in ('csv', 'xlsx', 'pdf', 'docx', 'doc', 'txt', 'pptx', 'png', 'jpg', 'jpeg'))
);

create index if not exists idx_co_files_campaign on public.co_files (campaign_id, category_key);
create index if not exists idx_co_files_worker on public.co_files (status, created_at)
  where status in ('QUARANTINED', 'SCANNING', 'PUBLISHING', 'CLEAN');
create unique index if not exists uq_co_files_path on public.co_files (storage_path);

drop trigger if exists trg_co_files_updated_at on public.co_files;
create trigger trg_co_files_updated_at
  before update on public.co_files
  for each row execute function public.set_updated_at();

-- A file's identity never changes once recorded, and an infected file can never be published.
create or replace function public.co_files_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.sha256 is not null and new.sha256 is distinct from old.sha256 then
    raise exception 'A stored file''s hash cannot change.' using errcode = 'check_violation';
  end if;
  if new.size_bytes <> old.size_bytes or new.original_name <> old.original_name
     or new.campaign_id <> old.campaign_id or new.version <> old.version then
    raise exception 'A stored file''s name, size, campaign and version cannot change.' using errcode = 'check_violation';
  end if;
  if old.status = 'INFECTED' and new.status not in ('INFECTED', 'ARCHIVED') then
    raise exception 'An infected file stays blocked.' using errcode = 'check_violation';
  end if;
  if new.status in ('PUBLISHING', 'PUBLISHED') and new.sha256 is null then
    raise exception 'A file must be scanned and hashed before it is published.' using errcode = 'check_violation';
  end if;
  if old.status = 'ARCHIVED' and new.status <> 'ARCHIVED' then
    raise exception 'An archived file stays archived; upload a new version instead.' using errcode = 'check_violation';
  end if;
  if new.status = 'ARCHIVED' and old.status <> 'ARCHIVED' then
    new.archived_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_co_files_guard on public.co_files;
create trigger trg_co_files_guard
  before update on public.co_files
  for each row execute function public.co_files_guard();

-- ============================================================
-- 4. Database versions and lead records
-- ============================================================

create table if not exists public.co_database_versions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.co_campaigns (id) on delete restrict,
  file_id uuid not null unique references public.co_files (id) on delete restrict,
  version int not null check (version > 0),
  status text not null default 'PENDING_SCAN' check (status in (
    'PENDING_SCAN', 'BLOCKED', 'VALIDATING', 'VALIDATION_FAILED', 'AWAITING_APPROVAL',
    'APPROVED', 'PUBLISHED', 'REJECTED', 'SUPERSEDED'
  )),
  record_count int not null default 0,
  valid_count int not null default 0,
  invalid_count int not null default 0,
  duplicate_count int not null default 0,
  columns jsonb not null default '[]'::jsonb,
  column_map jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  validated_at timestamptz,
  uploaded_by uuid references public.employees (id) on delete set null,
  decided_by uuid references public.employees (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_co_versions_campaign unique (campaign_id, version),
  -- The uploader can never be the approver (ISO A.5.3).
  constraint co_versions_two_people check (decided_by is null or uploaded_by is null or decided_by <> uploaded_by),
  constraint co_versions_rejection_reason check (status <> 'REJECTED' or length(trim(coalesce(decision_note, ''))) > 0)
);

create index if not exists idx_co_versions_status on public.co_database_versions (status);

drop trigger if exists trg_co_versions_updated_at on public.co_database_versions;
create trigger trg_co_versions_updated_at
  before update on public.co_database_versions
  for each row execute function public.set_updated_at();

-- Versions move forward only.
create or replace function public.co_version_status_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  allowed text[];
begin
  if new.status = old.status then
    return new;
  end if;
  allowed := case old.status
    when 'PENDING_SCAN' then array['BLOCKED', 'VALIDATING', 'VALIDATION_FAILED']
    when 'VALIDATING' then array['VALIDATION_FAILED', 'AWAITING_APPROVAL']
    when 'AWAITING_APPROVAL' then array['APPROVED', 'REJECTED', 'SUPERSEDED']
    when 'APPROVED' then array['PUBLISHED']
    when 'PUBLISHED' then array['SUPERSEDED']
    else array[]::text[]
  end;
  if not (new.status = any (allowed)) then
    raise exception 'A database version cannot move from % to %.', old.status, new.status using errcode = 'check_violation';
  end if;
  if new.status in ('APPROVED', 'REJECTED') then
    if new.decided_by is null then
      raise exception 'An approval or rejection must name who decided.' using errcode = 'check_violation';
    end if;
    new.decided_at := coalesce(new.decided_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_co_version_status_guard on public.co_database_versions;
create trigger trg_co_version_status_guard
  before update on public.co_database_versions
  for each row execute function public.co_version_status_guard();

create table if not exists public.co_lead_records (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.co_campaigns (id) on delete restrict,
  version_id uuid not null references public.co_database_versions (id) on delete restrict,
  row_number int not null,
  -- sha-256 of the normalised email, phone and company; the duplicate check uses it.
  record_key text not null,
  full_name text,
  first_name text,
  last_name text,
  email citext,
  phone text,
  company text,
  job_title text,
  country text,
  extra jsonb not null default '{}'::jsonb,
  status text not null default 'STAGED' check (status in ('STAGED', 'INVALID', 'DUPLICATE', 'AVAILABLE', 'WITHDRAWN')),
  invalid_reasons text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_co_lead_row unique (version_id, row_number)
);

create index if not exists idx_co_leads_campaign_status on public.co_lead_records (campaign_id, status);
create index if not exists idx_co_leads_version_status on public.co_lead_records (version_id, status);
-- One available record per person and company in a campaign.
create unique index if not exists uq_co_leads_available_key
  on public.co_lead_records (campaign_id, record_key)
  where status = 'AVAILABLE';

drop trigger if exists trg_co_leads_updated_at on public.co_lead_records;
create trigger trg_co_leads_updated_at
  before update on public.co_lead_records
  for each row execute function public.set_updated_at();

-- Keep the campaign status in step with its database while the campaign is still being prepared.
-- The status is worked out from all of the campaign's versions (a live version wins, then one
-- waiting for approval, then one being checked), so a second upload can never leave it stuck.
create or replace function public.co_sync_campaign_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  path constant text[] := array['AWAITING_DATABASE', 'DATABASE_VALIDATION', 'AWAITING_APPROVAL', 'READY_FOR_DISTRIBUTION'];
  current_status text;
  target text;
  from_index int;
  to_index int;
  i int;
begin
  if tg_op = 'UPDATE' and new.status = old.status then
    return new;
  end if;
  select status into current_status from public.co_campaigns where id = new.campaign_id for update;
  if current_status not in ('DRAFT', 'AWAITING_DATABASE', 'DATABASE_VALIDATION', 'AWAITING_APPROVAL') then
    return new; -- live, on hold, completed or archived: a new upload does not move the campaign
  end if;

  select case
    when bool_or(status = 'PUBLISHED') then 'READY_FOR_DISTRIBUTION'
    when bool_or(status in ('AWAITING_APPROVAL', 'APPROVED')) then 'AWAITING_APPROVAL'
    when bool_or(status in ('PENDING_SCAN', 'VALIDATING')) then 'DATABASE_VALIDATION'
    when count(*) > 0 then 'AWAITING_DATABASE'
  end
  into target
  from public.co_database_versions
  where campaign_id = new.campaign_id;

  if target is null or target = current_status then
    return new;
  end if;
  if current_status = 'DRAFT' and target = 'AWAITING_DATABASE' then
    return new; -- the manager has not released the draft yet
  end if;

  from_index := coalesce(array_position(path, current_status), 1); -- DRAFT starts like AWAITING_DATABASE
  to_index := array_position(path, target);
  if to_index > from_index then
    -- Walk forward one allowed step at a time, so the status guard stays strict.
    for i in from_index + 1 .. to_index loop
      update public.co_campaigns set status = path[i] where id = new.campaign_id;
    end loop;
  else
    update public.co_campaigns set status = target where id = new.campaign_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_co_sync_campaign_status on public.co_database_versions;
create trigger trg_co_sync_campaign_status
  after insert or update of status on public.co_database_versions
  for each row execute function public.co_sync_campaign_status();

-- Publication: called by the file worker after the approved file is in the approved bucket
-- and its hash has been re-checked. The version's clean rows become available; the previous
-- published version is superseded and its rows withdrawn.
create or replace function public.co_publish_version(p_version_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  f record;
  published int;
begin
  select * into v from public.co_database_versions where id = p_version_id for update;
  if not found then
    raise exception 'Database version not found.' using errcode = 'no_data_found';
  end if;
  if v.status <> 'APPROVED' then
    raise exception 'Only an approved version can be published (this one is %).', v.status using errcode = 'check_violation';
  end if;
  select * into f from public.co_files where id = v.file_id;
  if f.status <> 'PUBLISHED' or f.bucket <> 'co-approved' then
    raise exception 'The file must be in the approved store before its records are published.' using errcode = 'check_violation';
  end if;

  update public.co_lead_records set status = 'WITHDRAWN'
  where campaign_id = v.campaign_id and status = 'AVAILABLE' and version_id <> v.id;

  update public.co_database_versions set status = 'SUPERSEDED'
  where campaign_id = v.campaign_id and status = 'PUBLISHED' and id <> v.id;

  update public.co_lead_records set status = 'AVAILABLE'
  where version_id = v.id and status = 'STAGED';
  get diagnostics published = row_count;

  update public.co_database_versions set status = 'PUBLISHED', published_at = now() where id = v.id;
  return published;
end;
$$;

-- ============================================================
-- 5. Never delete: archive instead
-- ============================================================

create or replace function public.co_block_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception '% rows are archived, never deleted.', tg_table_name using errcode = 'insufficient_privilege';
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['co_campaigns', 'co_campaign_members', 'co_files', 'co_database_versions', 'co_lead_records']
  loop
    execute format('drop trigger if exists trg_%s_no_delete on public.%I', t, t);
    execute format('create trigger trg_%s_no_delete before delete on public.%I for each row execute function public.co_block_delete()', t, t);
  end loop;
end $$;

-- ============================================================
-- 6. Audit: every change to campaigns, members, files and versions is in the hash-chained log.
--    Lead rows are audited per version (counts, decision), not per row, to keep the chain lean.
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array['co_campaigns', 'co_campaign_members', 'co_files', 'co_database_versions', 'co_file_categories']
  loop
    execute format('drop trigger if exists trg_audit_%s on public.%I', t, t);
    if t = 'co_file_categories' then
      execute format('create trigger trg_audit_%s after insert or update or delete on public.%I for each row execute function public.log_audit_event_settings()', t, t);
    else
      execute format('create trigger trg_audit_%s after insert or update or delete on public.%I for each row execute function public.log_audit_event()', t, t);
    end if;
  end loop;
end $$;

-- ============================================================
-- 7. Access: server only. RLS on, no grants to anon or authenticated.
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array['co_campaigns', 'co_campaign_members', 'co_file_categories', 'co_files', 'co_database_versions', 'co_lead_records']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

revoke all on sequence public.co_campaign_code_seq from public, anon, authenticated;
grant usage, select on sequence public.co_campaign_code_seq to service_role;

revoke all on function public.co_publish_version(uuid) from public, anon, authenticated;
grant execute on function public.co_publish_version(uuid) to service_role;
revoke all on function public.co_sync_campaign_status() from public, anon, authenticated;

-- ============================================================
-- 8. Private storage: quarantine (uploads land here) and approved (scanned, approved files).
--    No storage policies for signed-in users: the server hands out short signed URLs.
-- ============================================================

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('co-quarantine', 'co-quarantine', false, 104857600),
           ('co-approved', 'co-approved', false, 104857600)
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
  end if;
end $$;

notify pgrst, 'reload schema';
