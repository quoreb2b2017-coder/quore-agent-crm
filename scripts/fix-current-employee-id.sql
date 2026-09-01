-- Paste in Supabase SQL Editor.
-- Fixes: function public.current_employee_id() does not exist
-- (employee insert / audit log trigger)

create or replace function public.current_employee_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  emp uuid;
begin
  begin
    emp := public.jwt_employee_id();
    if emp is not null then
      return emp;
    end if;
  exception
    when undefined_function then
      null;
  end;

  select id into emp
  from public.employees
  where auth_user_id = auth.uid()
  limit 1;

  return emp;
end;
$$;

grant execute on function public.current_employee_id() to authenticated, anon, service_role;
