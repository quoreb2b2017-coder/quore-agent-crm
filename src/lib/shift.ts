import { trustedNowDate, trustedNowMs } from "@/lib/clock-anchor";
import {
  addDaysIso,
  minutesInTimeZone,
  shiftDateIso,
  todayIso,
} from "@/lib/format";
import {
  formatMinutesLabel,
  getWorkSettings,
  shiftSpansMidnight,
  wallToUtc,
  zonedWallToUtc,
} from "@/lib/work-settings";

/** Productivity targets are counted from this shift date onward. */
export const TRACKING_START_DATE = "2026-10-01";
export const SHIFT_WORKING_SECONDS = 9 * 3600;
/** Two separate 15-minute tea slots. Each slot can be taken in parts until its own 15 minutes are used. */
export const TEA_BREAK_MINUTES = 15;
export const TEA_BREAKS_PER_SHIFT = 2;
export const LUNCH_BREAK_MINUTES = 45;
export const TEA_BREAK_SECONDS = TEA_BREAK_MINUTES * 60;
export const LUNCH_BREAK_SECONDS = LUNCH_BREAK_MINUTES * 60;
export const TEA_BREAK_BUDGET_SECONDS = TEA_BREAK_SECONDS * TEA_BREAKS_PER_SHIFT;
export const LUNCH_BREAK_BUDGET_SECONDS = LUNCH_BREAK_SECONDS;
export const BREAK_TOTAL_SECONDS = TEA_BREAK_BUDGET_SECONDS + LUNCH_BREAK_BUDGET_SECONDS;
export const PRODUCTIVE_SECONDS = SHIFT_WORKING_SECONDS - BREAK_TOTAL_SECONDS;

export const SHIFT_WORKING_LABEL = "9 hrs";
export const PRODUCTIVE_HOURS_LABEL = "7 hrs 45 min";
export const BREAK_BUDGET_LABEL = "1 hr 15 min";
export const BREAK_POLICY_LABEL = `Tea ${TEA_BREAKS_PER_SHIFT} × ${TEA_BREAK_MINUTES} min · Lunch ${LUNCH_BREAK_MINUTES} min`;

export type BreakSlot = "TEA_1" | "TEA_2" | "LUNCH";
export type PolicyBreakType = BreakSlot;
export const BREAK_SLOTS: BreakSlot[] = ["TEA_1", "TEA_2", "LUNCH"];

/** Older rows saved as "TEA" or "GENERAL" count against the first tea slot. */
export function breakSlot(breakType: string): BreakSlot {
  if (breakType === "LUNCH") return "LUNCH";
  if (breakType === "TEA_2") return "TEA_2";
  return "TEA_1";
}

export function slotBudgetSeconds(slot: BreakSlot): number {
  return slot === "LUNCH" ? LUNCH_BREAK_SECONDS : TEA_BREAK_SECONDS;
}

export function breakSecondsBySlot(
  rows: { id?: string; break_type: string; started_at: string; ended_at: string | null; duration_seconds?: number | null }[],
  options?: { closedOnly?: boolean; excludeId?: string }
): Record<BreakSlot, number> {
  const totals: Record<BreakSlot, number> = { TEA_1: 0, TEA_2: 0, LUNCH: 0 };
  for (const row of rows) {
    if (options?.excludeId && row.id === options.excludeId) continue;
    if (options?.closedOnly && row.ended_at == null) continue;
    totals[breakSlot(row.break_type)] += breakDurationSeconds(row);
  }
  return totals;
}

/** Wall time on a shift calendar date, in the admin's time zone. */
export function istLocalToUtc(dateIso: string, hour: number, minute: number, second = 0): Date {
  return zonedWallToUtc(dateIso, hour, minute, getWorkSettings().timeZone, second);
}

export function shiftWindowUtc(shiftDate = todayIso()): { start: Date; end: Date } {
  const settings = getWorkSettings();
  const endDate = shiftSpansMidnight(settings) ? addDaysIso(shiftDate, 1) : shiftDate;
  return {
    start: wallToUtc(shiftDate, settings.loginMinutes, settings.timeZone),
    end: wallToUtc(endDate, settings.logoutMinutes, settings.timeZone),
  };
}

/** Kept for older labels. Prefer `formatMinutesLabel(getWorkSettings().lateMinutes)`. */
export const INDIA_LATE_MINUTES = 19 * 60;
export const INDIA_LATE_TIME = "7:00 PM";

/** Productive time starts at 6:30 PM even if they signed in earlier, and stops at 3:30 AM. */
export function creditedWorkBounds(startedAt: string | Date, endedAt: Date | number = new Date()) {
  const start = typeof startedAt === "string" ? new Date(startedAt) : startedAt;
  const endAt = typeof endedAt === "number" ? new Date(endedAt) : endedAt;
  const shiftDate = shiftDateIso(start);
  const { start: official, end } = shiftWindowUtc(shiftDate);
  const from = Math.max(start.getTime(), official.getTime());
  const to = Math.min(endAt.getTime(), end.getTime());
  return {
    from,
    to,
    seconds: Math.max(0, Math.floor((to - from) / 1000)),
    shiftDate,
  };
}

/** Part of a break / washroom visit that falls inside the session's credited 6:30 PM–3:30 AM window. */
export function creditedAwaySeconds(
  sessionStartedAt: string | Date,
  row: { started_at: string; ended_at: string | null; duration_seconds?: number | null },
  now = trustedNowMs()
) {
  const sessionStart = typeof sessionStartedAt === "string" ? new Date(sessionStartedAt) : sessionStartedAt;
  const { start: official, end } = shiftWindowUtc(shiftDateIso(sessionStart));
  const windowFrom = Math.max(sessionStart.getTime(), official.getTime());
  const startedAt = new Date(row.started_at).getTime();
  const endedAt = startedAt + breakDurationSeconds(row, now) * 1000;
  const from = Math.max(startedAt, windowFrom);
  const to = Math.min(endedAt, end.getTime());
  return Math.max(0, Math.floor((to - from) / 1000));
}

export type BreakExcess = Record<BreakSlot, number> & { washroom: number; total: number };

/**
 * Time over each slot (Tea 1 / Tea 2 15 min, Lunch 45 min). Washroom uses whatever is left of the
 * 1 hr 15 min total; washroom beyond that is excess too.
 */
export function breakExcess(used: Record<BreakSlot, number>, washroomSeconds = 0): BreakExcess {
  let withinSlots = 0;
  const excess = { TEA_1: 0, TEA_2: 0, LUNCH: 0, washroom: 0, total: 0 };
  for (const slot of BREAK_SLOTS) {
    const seconds = Math.max(0, used[slot]);
    const budget = slotBudgetSeconds(slot);
    withinSlots += Math.min(seconds, budget);
    excess[slot] = Math.max(0, seconds - budget);
  }
  excess.washroom = Math.max(0, withinSlots + Math.max(0, washroomSeconds) - BREAK_TOTAL_SECONDS);
  excess.total = excess.TEA_1 + excess.TEA_2 + excess.LUNCH + excess.washroom;
  return excess;
}

export function emptyExcess(): BreakExcess {
  return { TEA_1: 0, TEA_2: 0, LUNCH: 0, washroom: 0, total: 0 };
}

export function addExcess(sum: BreakExcess, next: BreakExcess): BreakExcess {
  return {
    TEA_1: sum.TEA_1 + next.TEA_1,
    TEA_2: sum.TEA_2 + next.TEA_2,
    LUNCH: sum.LUNCH + next.LUNCH,
    washroom: sum.washroom + next.washroom,
    total: sum.total + next.total,
  };
}

/** Break allowance not yet used: slot time within budget plus washroom, out of 1 hr 15 min. */
export function breakPoolLeftSeconds(used: Record<BreakSlot, number>, washroomSeconds = 0) {
  const withinSlots = BREAK_SLOTS.reduce(
    (sum, slot) => sum + Math.min(Math.max(0, used[slot]), slotBudgetSeconds(slot)),
    0
  );
  return Math.max(0, BREAK_TOTAL_SECONDS - withinSlots - Math.max(0, washroomSeconds));
}

/** True when the clock-in is after the shift login time in the configured time zone. */
export function isLateClockIn(at: Date | string = trustedNowDate()) {
  const date = typeof at === "string" ? new Date(at) : at;
  const settings = getWorkSettings();
  const shiftDate = shiftDateIso(date);
  return date.getTime() > wallToUtc(shiftDate, settings.loginMinutes, settings.timeZone).getTime();
}

/** From logout (or midnight) on the shift date through the next boundary — includes early login. */
export function shiftAccountingWindowUtc(shiftDate = todayIso()): { start: Date; end: Date } {
  const settings = getWorkSettings();
  if (!shiftSpansMidnight(settings)) {
    return {
      start: wallToUtc(shiftDate, 0, settings.timeZone),
      end: wallToUtc(addDaysIso(shiftDate, 1), 0, settings.timeZone),
    };
  }
  return {
    start: wallToUtc(shiftDate, settings.logoutMinutes, settings.timeZone),
    end: wallToUtc(addDaysIso(shiftDate, 1), settings.logoutMinutes, settings.timeZone),
  };
}

export function isInShiftWindow(date = trustedNowDate()): boolean {
  const settings = getWorkSettings();
  const minutes = minutesInTimeZone(date, settings.timeZone);
  if (shiftSpansMidnight(settings)) {
    return minutes >= settings.loginMinutes || minutes < settings.logoutMinutes;
  }
  return minutes >= settings.loginMinutes && minutes < settings.logoutMinutes;
}

export function shiftCountdown(date = trustedNowDate()): { open: boolean; minutesRemaining: number } {
  const settings = getWorkSettings();
  const minutes = minutesInTimeZone(date, settings.timeZone);
  const { loginMinutes: login, logoutMinutes: logout } = settings;
  const overnight = shiftSpansMidnight(settings);
  const open = overnight ? minutes >= login || minutes < logout : minutes >= login && minutes < logout;
  if (open) {
    const minutesRemaining = overnight
      ? minutes >= login
        ? 24 * 60 - minutes + logout
        : logout - minutes
      : logout - minutes;
    return { open, minutesRemaining };
  }
  const minutesRemaining = minutes < login ? login - minutes : 24 * 60 - minutes + login;
  return { open, minutesRemaining };
}

export function shiftLengthLabel() {
  return formatMinutesLabel(getWorkSettings().loginMinutes);
}

export function allottedBreakSeconds(breakType: string, remainingSeconds?: number): number {
  const perType = breakType === "LUNCH" ? LUNCH_BREAK_SECONDS : TEA_BREAK_SECONDS;
  if (remainingSeconds == null) return perType;
  return Math.min(perType, Math.max(0, remainingSeconds));
}

export function breakBudgetSeconds(breakType: string): number {
  return breakType === "LUNCH" ? LUNCH_BREAK_BUDGET_SECONDS : TEA_BREAK_BUDGET_SECONDS;
}

/** How long the break in progress may run, given closed time already used in the same slot. */
export function remainingBreakPoolSeconds(usedSeconds: number) {
  return Math.max(0, BREAK_TOTAL_SECONDS - Math.max(0, usedSeconds));
}

export function slotRemainingInPool(slotLeftSeconds: number, poolLeftSeconds: number) {
  return Math.max(0, Math.min(slotLeftSeconds, poolLeftSeconds));
}

/** How long the break in progress may run, given closed time already used in the same slot. */
export function openBreakLimitSeconds(
  breakType: string,
  closedSameSlotSeconds: number,
  poolLeftSeconds?: number
): number {
  const slotLeft = Math.max(0, slotBudgetSeconds(breakSlot(breakType)) - closedSameSlotSeconds);
  if (poolLeftSeconds == null) return slotLeft;
  return Math.min(slotLeft, Math.max(0, poolLeftSeconds));
}

export function breakDurationSeconds(
  row: { started_at: string; ended_at: string | null; duration_seconds?: number | null },
  now = trustedNowMs()
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
  if (breakType === "TEA_1") return "Tea 1";
  if (breakType === "TEA_2") return "Tea 2";
  if (breakType === "GENERAL") return "Break";
  return breakType.replaceAll("_", " ").toLowerCase();
}

export function isLunchBreak(breakType: string): boolean {
  return breakType === "LUNCH";
}

/** Half day needs half the productive target and half the 9-hour shift. */
export function productiveTargetSeconds(attendanceStatus?: string | null) {
  return attendanceStatus === "HALF_DAY" ? Math.floor(PRODUCTIVE_SECONDS / 2) : PRODUCTIVE_SECONDS;
}

export function shiftTargetSeconds(attendanceStatus?: string | null) {
  return attendanceStatus === "HALF_DAY" ? Math.floor(SHIFT_WORKING_SECONDS / 2) : SHIFT_WORKING_SECONDS;
}

/** A half day counts at most half a productive day, even if the person stayed longer. */
export function creditedProductiveSeconds(activeSeconds: number, attendanceStatus?: string | null) {
  const seconds = Math.max(0, activeSeconds);
  if (attendanceStatus !== "HALF_DAY") return seconds;
  return Math.min(seconds, productiveTargetSeconds("HALF_DAY"));
}

export function productivityPercent(activeSeconds: number, targetSeconds = PRODUCTIVE_SECONDS): number {
  if (targetSeconds <= 0) return 0;
  return Math.round((activeSeconds / targetSeconds) * 100);
}

export function toDatetimeLocalIst(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: getWorkSettings().timeZone,
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
