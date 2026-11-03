-- Pending overtime waits for admin approval (including a full 1 hour — never auto).
-- After shortfall-fill, remainder is OT and stays pending until admin approves.

alter table public.attendance
  add column if not exists overtime_pending_minutes int not null default 0
    check (overtime_pending_minutes >= 0 and overtime_pending_minutes <= 60);

comment on column public.attendance.overtime_pending_minutes is
  'Post-logout OT minutes after shortfall fill that still need admin approval (< 1h). Cleared when approved or auto.';
