import { eachDateInclusive, isWeekendIso } from "@/lib/format";

export const ANNUAL_PAID_LEAVE_DAYS = 18;

export function workingDatesInclusive(start: string, end: string) {
  return eachDateInclusive(start, end).filter((date) => !isWeekendIso(date));
}

export function leaveDaysCount(start: string, end: string) {
  return workingDatesInclusive(start, end).length;
}

export function paidLeaveQuota(used: number, pending = 0, people = 1) {
  const available = ANNUAL_PAID_LEAVE_DAYS * Math.max(1, people);
  const remaining = Math.max(0, available - used);
  return {
    available,
    used: Math.max(0, used),
    remaining,
    pending: Math.max(0, pending),
    percentUsed: available > 0 ? Math.min(100, Math.round((used / available) * 100)) : 0,
  };
}
