-- Security alert when roles or permissions change outside WorkTrack (backlog item 20).
-- Changes made in the app already alert Super Admin with the person's name. A change with no
-- signed-in actor came from the SQL editor, a script or a leaked key, and that is what this catches.
-- One alert per statement, so a bulk change does not flood the bell.
create or replace function public.alert_role_change_outside_app()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_employee_id() is not null then
    return null;
  end if;

  insert into public.notifications (employee_id, type, title, body)
  select er.employee_id,
         'SECURITY_ALERT',
         case tg_table_name
           when 'role_permissions' then 'Role permissions changed outside WorkTrack'
           else 'Someone''s role changed outside WorkTrack'
         end,
         'A ' || lower(tg_op) || ' on ' || replace(tg_table_name, '_', ' ') ||
           ' was made directly in the database, not from WorkTrack. If you did not do this, check the audit log now.'
  from public.employee_roles er
  join public.roles r on r.id = er.role_id and r.role_key = 'SUPER_ADMIN';

  return null;
end;
$$;

revoke all on function public.alert_role_change_outside_app() from public, anon, authenticated;

drop trigger if exists trg_alert_role_permissions_outside_app on public.role_permissions;
create trigger trg_alert_role_permissions_outside_app
  after insert or update or delete on public.role_permissions
  for each statement execute function public.alert_role_change_outside_app();

drop trigger if exists trg_alert_employee_roles_outside_app on public.employee_roles;
create trigger trg_alert_employee_roles_outside_app
  after insert or update or delete on public.employee_roles
  for each statement execute function public.alert_role_change_outside_app();
