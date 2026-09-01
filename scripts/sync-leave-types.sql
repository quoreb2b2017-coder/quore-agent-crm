-- Paste in Supabase SQL Editor if you are not running `supabase db push`.
-- Leave types are labels only. Paid leave quota is 18 working days per year
-- in the app (Saturday and Sunday are week off and are not deducted).

insert into public.leave_types (name, default_annual_days, is_paid) values
  ('Casual Leave', 18, true),
  ('Sick Leave', 18, true),
  ('Earned Leave', 18, true),
  ('Unpaid Leave', 0, false)
on conflict (name) do update
set
  default_annual_days = excluded.default_annual_days,
  is_paid = excluded.is_paid;
