-- Allow admin to approve more than 1 hour of overtime (up to 12h, same as overtime_minutes).
alter table public.attendance
  drop constraint if exists attendance_overtime_pending_minutes_check;

alter table public.attendance
  add constraint attendance_overtime_pending_minutes_check
  check (overtime_pending_minutes >= 0 and overtime_pending_minutes <= 720);

comment on column public.attendance.overtime_pending_minutes is
  'OT minutes past logout waiting for admin approve (max 12h). Never auto-counted.';

comment on column public.attendance.overtime_minutes is
  'Admin-approved OT minutes past official logout for this day (max 12h).';
