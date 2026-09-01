-- Paid leave is 18 working days per year (shared quota).
-- Saturday and Sunday are office week off.

update public.leave_types
set default_annual_days = 18
where is_paid = true;

update public.leave_types
set default_annual_days = 0
where is_paid = false;
