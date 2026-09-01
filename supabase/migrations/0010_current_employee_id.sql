-- Audit trigger (0004) calls current_employee_id(); later RLS uses jwt_employee_id().
-- Some databases never got 0001's helper, so employee insert fails.

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
  if to_regprocedure('public.jwt_employee_id()') is not null then
    emp := public.jwt_employee_id();
    if emp is not null then
      return emp;
    end if;
  end if;

  select id into emp
  from public.employees
  where auth_user_id = auth.uid()
  limit 1;

  return emp;
end;
$$;

grant execute on function public.current_employee_id() to authenticated, anon, service_role;
