-- Separation of duties (ISO A.5.3): whoever sets salaries must not also run payroll.
-- HR keeps salary.view and salary.manage. Super Admin keeps payroll.manage.
delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and r.role_key = 'HR'
  and p.permission_key = 'payroll.manage';
