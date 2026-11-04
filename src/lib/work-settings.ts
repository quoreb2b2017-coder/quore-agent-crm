/** Shift clock the admin can change. Safe to import from client components. */

export type WorkSettings = {
  timeZone: string;
  /** Minutes from midnight in `timeZone`. */
  loginMinutes: number;
  logoutMinutes: number;
  lateMinutes: number;
  /** Default paid-leave days per employee per year, when no custom balance is saved. */
  annualPaidLeaveDays: number;
};

/** Per-employee override stored in `employees.work_schedule`. Empty = company default. */
export type WorkSchedule = {
  loginMinutes: number;
  logoutMinutes: number;
  /** ISO timestamp when this custom shift was last assigned/updated by admin. */
  updatedAt?: string;
};

export const DEFAULT_WORK_SETTINGS: WorkSettings = {
  timeZone: "Asia/Kolkata",
  loginMinutes: 18 * 60 + 30,
  logoutMinutes: 3 * 60 + 30,
  lateMinutes: 19 * 60,
  annualPaidLeaveDays: 18,
};

function asFiniteMinutes(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const minutes = Math.floor(value);
  if (minutes < 0 || minutes >= 24 * 60) return null;
  return minutes;
}

/** Reads a saved employee schedule from jsonb. Null means use company shift. */
export function parseWorkSchedule(raw: unknown): WorkSchedule | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const loginMinutes = asFiniteMinutes(row.loginMinutes);
  const logoutMinutes = asFiniteMinutes(row.logoutMinutes);
  if (loginMinutes == null || logoutMinutes == null) return null;
  if (loginMinutes === logoutMinutes) return null;
  const updatedAt = typeof row.updatedAt === "string" && row.updatedAt.trim() ? row.updatedAt : undefined;
  return { loginMinutes, logoutMinutes, ...(updatedAt ? { updatedAt } : {}) };
}

/** Company settings with optional employee login/logout override. Late = login + 1 min. */
export function applyWorkSchedule(
  company: WorkSettings,
  schedule: WorkSchedule | null | undefined
): WorkSettings {
  if (!schedule) return company;
  return {
    ...company,
    loginMinutes: schedule.loginMinutes,
    logoutMinutes: schedule.logoutMinutes,
    lateMinutes: (schedule.loginMinutes + 1) % (24 * 60),
  };
}

/**
 * Prefer the shift frozen on the attendance row (day they worked).
 * Falls back to current employee/company settings when snapshot is missing.
 */
export function applyAttendanceShiftSnapshot(
  base: WorkSettings,
  snapshot: {
    shift_login_minutes?: number | null;
    shift_logout_minutes?: number | null;
  } | null | undefined
): WorkSettings {
  const login = snapshot?.shift_login_minutes;
  const logout = snapshot?.shift_logout_minutes;
  if (
    typeof login !== "number" ||
    typeof logout !== "number" ||
    !Number.isFinite(login) ||
    !Number.isFinite(logout) ||
    login === logout ||
    login < 0 ||
    login >= 24 * 60 ||
    logout < 0 ||
    logout >= 24 * 60
  ) {
    return base;
  }
  return applyWorkSchedule(base, {
    loginMinutes: Math.floor(login),
    logoutMinutes: Math.floor(logout),
  });
}

/**
 * JSON to store on `employees.work_schedule`.
 * Stamps `updatedAt` when login/logout change; keeps previous stamp if times unchanged.
 */
export function workSchedulePayload(
  schedule: WorkSchedule | null,
  previous: WorkSchedule | null = null
): WorkSchedule | Record<string, never> {
  if (!schedule) return {};
  const sameTimes =
    previous != null &&
    previous.loginMinutes === schedule.loginMinutes &&
    previous.logoutMinutes === schedule.logoutMinutes;
  return {
    loginMinutes: schedule.loginMinutes,
    logoutMinutes: schedule.logoutMinutes,
    updatedAt:
      sameTimes && previous.updatedAt ? previous.updatedAt : new Date().toISOString(),
  };
}

export const TIME_ZONE_OPTIONS: { id: string; label: string }[] = [
  { id: "Asia/Kolkata", label: "India — Asia/Kolkata" },
  { id: "America/New_York", label: "US Eastern — America/New_York" },
  { id: "America/Chicago", label: "US Central — America/Chicago" },
  { id: "America/Denver", label: "US Mountain — America/Denver" },
  { id: "America/Phoenix", label: "US Arizona — America/Phoenix" },
  { id: "America/Los_Angeles", label: "US Pacific — America/Los_Angeles" },
  { id: "Europe/London", label: "UK — Europe/London" },
  { id: "UTC", label: "UTC" },
];

let active: WorkSettings = DEFAULT_WORK_SETTINGS;

export function getWorkSettings(): WorkSettings {
  return active;
}

export function setWorkSettings(next: WorkSettings) {
  active = next;
}

export function shiftSpansMidnight(settings: WorkSettings = getWorkSettings()) {
  return settings.logoutMinutes <= settings.loginMinutes;
}

export function shiftLengthMinutes(settings: WorkSettings = getWorkSettings()) {
  if (shiftSpansMidnight(settings)) {
    return 24 * 60 - settings.loginMinutes + settings.logoutMinutes;
  }
  return settings.logoutMinutes - settings.loginMinutes;
}

export function minutesToTimeValue(minutes: number) {
  const safe = ((Math.floor(minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(safe / 60);
  const minute = safe % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function timeValueToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function formatMinutesLabel(minutes: number, timeZone = getWorkSettings().timeZone) {
  const value = minutesToTimeValue(minutes);
  const [hour, minute] = value.split(":").map(Number);
  const sample = zonedWallToUtc("2026-01-15", hour, minute, timeZone);
  return sample.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  });
}

/** Parse labels like "2:30 PM", "14:30", "7:30pm" → minutes from midnight. */
export function parseMinutesLabel(label: string): number | null {
  const raw = label.trim();
  const twelve = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(raw);
  if (twelve) {
    let hour = Number(twelve[1]);
    const minute = Number(twelve[2]);
    const meridiem = twelve[3].toUpperCase();
    if (hour < 1 || hour > 12 || minute > 59) return null;
    if (meridiem === "AM") {
      if (hour === 12) hour = 0;
    } else if (hour !== 12) {
      hour += 12;
    }
    return hour * 60 + minute;
  }
  return timeValueToMinutes(raw);
}

/**
 * Recover the shift that day was worked on when snapshot columns are empty.
 * Only trusts "Late after 2:30 PM" notes — never guesses from check-in
 * (overnight shifts get wrong login if we floor 4:33 AM → 4:30 AM).
 */
export function inferScheduleForAttendanceDay(
  base: WorkSettings,
  day: {
    notes?: string | null;
    first_check_in?: string | null;
  }
): WorkSchedule | null {
  const length = shiftLengthMinutes(base);
  const lateMatch = day.notes?.match(/Late after\s+([^[\n]+)/i);
  if (!lateMatch) return null;
  const login = parseMinutesLabel(lateMatch[1].trim());
  if (login == null) return null;
  return {
    loginMinutes: login,
    logoutMinutes: (login + length) % (24 * 60),
  };
}

export function timeZoneShort(timeZone: string) {
  if (timeZone === "Asia/Kolkata") return "IST";
  if (timeZone === "America/New_York") return "ET";
  if (timeZone === "America/Chicago") return "CT";
  if (timeZone === "America/Denver") return "MT";
  if (timeZone === "America/Phoenix") return "MST";
  if (timeZone === "America/Los_Angeles") return "PT";
  if (timeZone === "Europe/London") return "UK";
  if (timeZone === "UTC") return "UTC";
  return timeZone;
}

/** True when `lateMinutes` sits strictly inside the shift, after login. */
export function lateIsInsideShift(settings: WorkSettings) {
  const { loginMinutes: login, logoutMinutes: logout, lateMinutes: late } = settings;
  if (late === login || late === logout) return false;
  if (shiftSpansMidnight(settings)) {
    const afterLogin = late > login || late < logout;
    return afterLogin;
  }
  return late > login && late < logout;
}

export function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  let hour = get("hour");
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return asUtc - date.getTime();
}

/** Wall-clock time on a calendar date in `timeZone`, as a UTC instant. */
export function zonedWallToUtc(
  dateIso: string,
  hour: number,
  minute: number,
  timeZone: string,
  second = 0
): Date {
  const [year, month, day] = dateIso.slice(0, 10).split("-").map(Number);
  let utc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset1 = zoneOffsetMs(new Date(utc), timeZone);
  utc -= offset1;
  const offset2 = zoneOffsetMs(new Date(utc), timeZone);
  if (offset2 !== offset1) utc -= offset2 - offset1;
  return new Date(utc);
}

export function wallToUtc(dateIso: string, minutes: number, timeZone = getWorkSettings().timeZone) {
  const safe = ((Math.floor(minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  return zonedWallToUtc(dateIso, Math.floor(safe / 60), safe % 60, timeZone);
}
