-- Admin-approved overtime after the employee's official logout for that day.
-- Productive time may continue for this many minutes past shift end.

alter table public.attendance
  add column if not exists overtime_minutes int not null default 0
    check (overtime_minutes >= 0 and overtime_minutes <= 720);

comment on column public.attendance.overtime_minutes is
  'Minutes past official logout that admin approved as overtime for this attendance day.';
