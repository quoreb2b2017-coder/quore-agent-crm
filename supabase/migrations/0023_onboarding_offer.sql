-- Offer letter details for onboarding (designation, CTC, sent/accepted dates).
-- Run once in the Supabase SQL Editor after 0022_onboarding.sql.

alter table public.employee_onboarding
  add column if not exists offer jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
