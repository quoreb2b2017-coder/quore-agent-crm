-- Security alert when anyone becomes Super Admin (backlog item 20).
-- In the database so it also fires for scripts, the SQL editor and any future screen.
-- The alert lands in every Super Admin's bell; the app shows it as "Security".
create or replace function public.alert_super_admin_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  granted_role text;
  person record;
begin
  select role_key into granted_role from public.roles where id = new.role_id;
  if granted_role is distinct from 'SUPER_ADMIN' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.role_id = new.role_id then
    return new;
  end if;

  select full_name, employee_code into person from public.employees where id = new.employee_id;

  insert into public.notifications (employee_id, type, title, body)
  select er.employee_id,
         'SECURITY_ALERT',
         coalesce(person.full_name, 'Someone') || ' is now a Super Admin',
         coalesce(person.full_name, 'An employee') || ' (' || coalesce(person.employee_code, '?') ||
           ') was given the Super Admin role. If you did not expect this, check the audit log now.'
  from public.employee_roles er
  join public.roles r on r.id = er.role_id and r.role_key = 'SUPER_ADMIN'
  where er.employee_id <> new.employee_id;

  return new;
end;
$$;

revoke all on function public.alert_super_admin_grant() from public, anon, authenticated;

drop trigger if exists trg_alert_super_admin_grant on public.employee_roles;
create trigger trg_alert_super_admin_grant
  after insert or update of role_id on public.employee_roles
  for each row execute function public.alert_super_admin_grant();
