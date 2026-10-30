-- New-joiner onboarding: checklist, joining details, and documents.
-- Run once in the Supabase SQL Editor.

create table if not exists public.employee_onboarding (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  status text not null default 'IN_PROGRESS'
    check (status in ('IN_PROGRESS', 'COMPLETED')),
  checklist jsonb not null default '{}'::jsonb,
  date_of_birth date,
  gender text,
  personal_email text,
  current_address text,
  permanent_address text,
  emergency_contact_name text,
  emergency_contact_relation text,
  emergency_contact_phone text,
  pan_number text,
  aadhaar_number text,
  bank_account_holder text,
  bank_name text,
  bank_account_number text,
  bank_ifsc text,
  previous_company text,
  notes text,
  completed_at timestamptz,
  completed_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_employee_onboarding_updated_at on public.employee_onboarding;
create trigger trg_employee_onboarding_updated_at
  before update on public.employee_onboarding
  for each row execute function public.set_updated_at();

create table if not exists public.onboarding_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  doc_type text not null,
  file_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  uploaded_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_onboarding_documents_employee
  on public.onboarding_documents(employee_id, created_at desc);

alter table public.employee_onboarding enable row level security;
alter table public.onboarding_documents enable row level security;

grant all on public.employee_onboarding to service_role;
grant all on public.onboarding_documents to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('onboarding-documents', 'onboarding-documents', false, 5242880)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
