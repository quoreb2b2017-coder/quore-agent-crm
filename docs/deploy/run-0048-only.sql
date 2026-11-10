-- Run this one file now: 0042 to 0047 are already applied on production (checked 10 Nov 2026).
-- app_settings had no Row Level Security while signed-in users held insert, update and delete
-- on it, so anyone with a login could change the company shift times through the database API.
-- Everyone may read the settings (every clock needs them); only Super Admin may change them.
-- Uses jwt_role_key() only: some databases do not have has_role() (it failed on production).
alter table public.app_settings enable row level security;

drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings
  for select to authenticated
  using (true);

drop policy if exists app_settings_manage on public.app_settings;
create policy app_settings_manage on public.app_settings
  for all to authenticated
  using (public.jwt_role_key() = 'SUPER_ADMIN')
  with check (public.jwt_role_key() = 'SUPER_ADMIN');

revoke all on public.app_settings from anon;
