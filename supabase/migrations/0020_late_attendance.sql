-- 0020_late_attendance.sql
-- Login after 7:00 PM IST is LATE. Still a working day (same as present for payroll).

alter table public.attendance drop constraint if exists attendance_status_check;

alter table public.attendance
  add constraint attendance_status_check
  check (status in ('PRESENT', 'LATE', 'ABSENT', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY', 'WEEK_OFF'));
