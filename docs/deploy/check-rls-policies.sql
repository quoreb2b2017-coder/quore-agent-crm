-- Read only. Run in the Supabase SQL Editor and copy the result back.
-- Shows the security helper functions and the Row Level Security rules on the tables the app
-- will read with each person's own login (USER_SCOPED_DATA=on). Nothing is changed.
select 'function' as kind, p.proname as name, pg_get_function_identity_arguments(p.oid) as detail, '' as extra
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('has_role', 'is_admin_like', 'has_permission', 'jwt_employee_id', 'jwt_role_key', 'current_employee_id')
union all
select 'rls', c.relname, case when c.relrowsecurity then 'on' else 'OFF' end, ''
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('chat_conversations', 'chat_messages', 'chat_reads', 'departments', 'designations',
                    'permissions', 'role_permissions', 'leave_types', 'leave_balances', 'app_settings')
union all
select 'policy', tablename || ' / ' || policyname, cmd,
       left(coalesce(qual, '') || ' | ' || coalesce(with_check, ''), 200)
from pg_policies
where schemaname = 'public'
  and tablename in ('chat_conversations', 'chat_messages', 'chat_reads', 'departments', 'designations',
                    'permissions', 'role_permissions', 'leave_types', 'leave_balances', 'app_settings')
order by 1, 2;
