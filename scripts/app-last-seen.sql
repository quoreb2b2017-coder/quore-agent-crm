-- Paste in Supabase SQL Editor. Safe to run again.
-- Lets Live Activity drop "In app" as soon as the WorkTrack tab is hidden.

alter table public.employee_sessions
  add column if not exists app_last_seen_at timestamptz;

comment on column public.employee_sessions.app_last_seen_at is
  'Last time the WorkTrack browser tab was visible. Null means they left the app.';

notify pgrst, 'reload schema';
