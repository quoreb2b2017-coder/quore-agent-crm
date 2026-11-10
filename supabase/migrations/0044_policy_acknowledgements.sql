-- Who read which notice or policy, and when (backlog item 22; controls WT-PRV-01, WT-PPL-01).
-- A new version of a document needs a new acknowledgement, so the version is part of the key.
create table if not exists public.policy_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  document_key text not null,
  version text not null,
  acknowledged_at timestamptz not null default now(),
  constraint policy_acknowledgements_once unique (employee_id, document_key, version)
);

create index if not exists policy_acknowledgements_document_idx
  on public.policy_acknowledgements (document_key, version);

alter table public.policy_acknowledgements enable row level security;
revoke all on public.policy_acknowledgements from public, anon, authenticated;
grant all on public.policy_acknowledgements to service_role;

-- Evidence for the controls: each acknowledgement is in the tamper-evident audit log.
drop trigger if exists trg_audit_policy_acknowledgements on public.policy_acknowledgements;
create trigger trg_audit_policy_acknowledgements
  after insert or update or delete on public.policy_acknowledgements
  for each row execute function public.log_audit_event();
