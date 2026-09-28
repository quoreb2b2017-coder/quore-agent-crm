import { eachDateInclusive, isWeekendIso } from "@/lib/format";

export const ANNUAL_PAID_LEAVE_DAYS = 18;

/** Internal placeholder until an admin assigns a real leave type. Never shown as a choice. */
export const UNDECIDED_LEAVE_TYPE = "Awaiting decision";

export function isUndecidedLeaveType(name?: string | null) {
  return !name || name === UNDECIDED_LEAVE_TYPE;
}

export function packLeaveNote(subject: string, reason: string) {
  const subjectLine = subject.replace(/\r?\n/g, " ").trim();
  const reasonText = reason.trim();
  if (!subjectLine) return reasonText;
  return `Subject: ${subjectLine}\n${reasonText}`;
}

export function unpackLeaveNote(raw: string | null | undefined) {
  if (!raw) return { subject: "", reason: "" };
  const match = raw.match(/^Subject: ([^\n]*)\n([\s\S]*)$/);
  if (!match) return { subject: "", reason: raw };
  return { subject: match[1].trim(), reason: match[2].trim() };
}

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
