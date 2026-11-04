-- Freeze the shift that applied when the day was worked.
-- Changing employees.work_schedule later must not rewrite past totals.
alter table public.attendance
  add column if not exists shift_login_minutes int;

alter table public.attendance
  add column if not exists shift_logout_minutes int;

alter table public.attendance
  drop constraint if exists attendance_shift_login_minutes_check;
alter table public.attendance
  add constraint attendance_shift_login_minutes_check
  check (
    shift_login_minutes is null
    or (shift_login_minutes >= 0 and shift_login_minutes < 1440)
  );

alter table public.attendance
  drop constraint if exists attendance_shift_logout_minutes_check;
alter table public.attendance
  add constraint attendance_shift_logout_minutes_check
  check (
    shift_logout_minutes is null
    or (shift_logout_minutes >= 0 and shift_logout_minutes < 1440)
  );

comment on column public.attendance.shift_login_minutes is
  'Login minutes (local TZ) frozen at first clock-in for this day.';
comment on column public.attendance.shift_logout_minutes is
  'Logout minutes (local TZ) frozen at first clock-in for this day.';
