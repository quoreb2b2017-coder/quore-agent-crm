import {
  addDaysIso,
  INDIA_LOGIN_MINUTES,
  INDIA_LOGOUT_MINUTES,
  INDIA_TIME_ZONE,
  minutesInTimeZone,
  todayIso,
} from "@/lib/format";

export const SHIFT_WORKING_SECONDS = 9 * 3600;
export const TEA_BREAK_MINUTES = 30;
export const LUNCH_BREAK_MINUTES = 45;
export const TEA_BREAK_SECONDS = TEA_BREAK_MINUTES * 60;
export const LUNCH_BREAK_SECONDS = LUNCH_BREAK_MINUTES * 60;
/** Total tea time per shift (shared across multiple tea breaks). */
export const TEA_BREAK_BUDGET_SECONDS = TEA_BREAK_SECONDS;
export const LUNCH_BREAK_BUDGET_SECONDS = LUNCH_BREAK_SECONDS;
export const BREAK_TOTAL_SECONDS = TEA_BREAK_BUDGET_SECONDS + LUNCH_BREAK_BUDGET_SECONDS;
export const PRODUCTIVE_SECONDS = SHIFT_WORKING_SECONDS - BREAK_TOTAL_SECONDS;

export const SHIFT_WORKING_LABEL = "9 hrs";
export const PRODUCTIVE_HOURS_LABEL = "7 hrs 45 min";
export const BREAK_BUDGET_LABEL = "1 hr 15 min";
export const BREAK_POLICY_LABEL = `Tea ${TEA_BREAK_MINUTES} min · Lunch ${LUNCH_BREAK_MINUTES} min`;

export type PolicyBreakType = "TEA" | "LUNCH";

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export function istLocalToUtc(dateIso: string, hour: number, minute: number, second = 0): Date {
  const [year, month, day] = dateIso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - IST_OFFSET_MS);
}

export function shiftWindowUtc(shiftDate = todayIso()): { start: Date; end: Date } {
  return {
    start: istLocalToUtc(shiftDate, 18, 30),
    end: istLocalToUtc(addDaysIso(shiftDate, 1), 3, 30),
  };
}

/** 3:30 AM on the shift date through 3:30 AM the next day — includes early login. */
export function shiftAccountingWindowUtc(shiftDate = todayIso()): { start: Date; end: Date } {
  return {
    start: istLocalToUtc(shiftDate, 3, 30),
    end: istLocalToUtc(addDaysIso(shiftDate, 1), 3, 30),
  };
}

export function isInShiftWindow(date = new Date()): boolean {
  const minutes = minutesInTimeZone(date, INDIA_TIME_ZONE);
  return minutes >= INDIA_LOGIN_MINUTES || minutes < INDIA_LOGOUT_MINUTES;
}

export function shiftCountdown(date = new Date()): { open: boolean; minutesRemaining: number } {
  const minutes = minutesInTimeZone(date, INDIA_TIME_ZONE);
  const open = minutes >= INDIA_LOGIN_MINUTES || minutes < INDIA_LOGOUT_MINUTES;
  if (open) {
    const minutesRemaining =
      minutes >= INDIA_LOGIN_MINUTES
        ? 24 * 60 - minutes + INDIA_LOGOUT_MINUTES
        : INDIA_LOGOUT_MINUTES - minutes;
    return { open, minutesRemaining };
  }
  return { open, minutesRemaining: INDIA_LOGIN_MINUTES - minutes };
}

export function allottedBreakSeconds(breakType: string, remainingSeconds?: number): number {
  const perType = breakType === "LUNCH" ? LUNCH_BREAK_SECONDS : TEA_BREAK_SECONDS;
  if (remainingSeconds == null) return perType;
  return Math.min(perType, Math.max(0, remainingSeconds));
}

export function breakBudgetSeconds(breakType: string): number {
  return breakType === "LUNCH" ? LUNCH_BREAK_BUDGET_SECONDS : TEA_BREAK_BUDGET_SECONDS;
}

export function breakDurationSeconds(
  row: { started_at: string; ended_at: string | null; duration_seconds?: number | null },
  now = Date.now()
) {
  if (row.ended_at) {
    if (row.duration_seconds != null) return Math.max(0, row.duration_seconds);
    return Math.max(
      0,
      Math.floor((new Date(row.ended_at).getTime() - new Date(row.started_at).getTime()) / 1000)
    );
  }
  return Math.max(0, Math.floor((now - new Date(row.started_at).getTime()) / 1000));
}

export function breakMinutesLabel(breakType: string): string {
  return breakType === "LUNCH" ? `${LUNCH_BREAK_MINUTES} min` : `${TEA_BREAK_MINUTES} min`;
}

export function formatBreakType(breakType: string): string {
  if (breakType === "LUNCH") return "Lunch";
  if (breakType === "TEA") return "Tea";
  if (breakType === "GENERAL") return "Break";
  return breakType.replaceAll("_", " ").toLowerCase();
}

export function isLunchBreak(breakType: string): boolean {
  return breakType === "LUNCH";
}

export function productivityPercent(activeSeconds: number): number {
  if (PRODUCTIVE_SECONDS <= 0) return 0;
  return Math.round((activeSeconds / PRODUCTIVE_SECONDS) * 100);
}

export function toDatetimeLocalIst(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

export function fromDatetimeLocalIst(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const [date, time] = trimmed.split("T");
  if (!date || !time) return null;
  const [hour, minute] = time.split(":").map(Number);
  return istLocalToUtc(date, hour, minute).toISOString();
}

export const NATIVE_SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
