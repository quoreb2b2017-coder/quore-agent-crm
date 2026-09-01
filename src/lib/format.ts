export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function formatEmploymentStatus(status: string) {
  if (status === "SUSPENDED") return "blocked";
  return status.toLowerCase().replaceAll("_", " ");
}

export function isEmploymentBlocked(status: string) {
  return status === "SUSPENDED" || status === "TERMINATED";
}

export function isEmploymentActive(status: string) {
  return status === "ACTIVE" || status === "ON_LEAVE";
}

export function formatInr(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(Number(amount))) return "—";
  return Number(amount).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

export function formatHoursFromSeconds(totalSeconds: number): string {
  const hours = totalSeconds / 3600;
  return `${hours.toFixed(1)}h`;
}

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export const INDIA_TIME_ZONE = "Asia/Kolkata";
export const US_TIME_ZONE = "America/New_York";
export const INDIA_LOGIN_TIME = "6:30 PM";
export const INDIA_LOGIN_MINUTES = 18 * 60 + 30;
export const INDIA_LOGOUT_TIME = "3:30 AM";
export const INDIA_LOGOUT_MINUTES = 3 * 60 + 30;
export const SHIFT_WINDOW_IST_LABEL = "6:30 PM – 3:30 AM IST";

function asDate(value: string | Date) {
  return typeof value === "string" ? new Date(value) : value;
}

export function formatTimeInZone(value: string | Date, timeZone: string) {
  return asDate(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  });
}

export function istWallDate(shiftDate: string, hour: number, minute: number) {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return new Date(`${shiftDate.slice(0, 10)}T${hh}:${mm}:00+05:30`);
}

/** US Eastern window that matches the IST 6:30 PM – 3:30 AM shift (handles DST). */
export function usShiftWindowLabel(date = new Date()) {
  const shiftDate = todayIso(date);
  const start = istWallDate(shiftDate, 18, 30);
  const end = istWallDate(addDaysIso(shiftDate, 1), 3, 30);
  return `${formatTimeInZone(start, US_TIME_ZONE)} – ${formatTimeInZone(end, US_TIME_ZONE)} ET`;
}

export function shiftWindowLabel(date = new Date()) {
  return `${usShiftWindowLabel(date)} · ${SHIFT_WINDOW_IST_LABEL}`;
}

export function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: INDIA_TIME_ZONE,
  });
}

export function formatDateTime(value: string | Date): string {
  const date = asDate(value);
  return `${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: US_TIME_ZONE,
  })}, ${formatTimeInZone(date, US_TIME_ZONE)} ET · ${formatTimeInZone(date, INDIA_TIME_ZONE)} IST`;
}

export function formatTime(value: string | Date): string {
  const date = asDate(value);
  return `${formatTimeInZone(date, US_TIME_ZONE)} ET · ${formatTimeInZone(date, INDIA_TIME_ZONE)} IST`;
}

export function formatCompactTime(value: string | Date): string {
  return formatTimeInZone(asDate(value), US_TIME_ZONE);
}

export function calendarDateIsoEt(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: US_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatChatDayLabel(value: string | Date): string {
  const date = asDate(value);
  const key = calendarDateIsoEt(date);
  const today = calendarDateIsoEt();
  if (key === today) return "Today";
  if (key === addDaysIso(today, -1)) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: US_TIME_ZONE,
  });
}

export function formatRelativeTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDateTime(date);
}

export function formatRelativeDay(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const key = date.toLocaleDateString("en-CA", { timeZone: INDIA_TIME_ZONE });
  const today = calendarDateIsoIst();
  if (key === today) return "Today";
  if (key === addDaysIso(today, -1)) return "Yesterday";
  return formatDate(date);
}

export function calendarDateIsoIst(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function addDaysIso(iso: string, days: number): string {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function eachDateInclusive(start: string, end: string): string[] {
  const out: string[] = [];
  let current = start.slice(0, 10);
  const last = end.slice(0, 10);
  if (current > last) return out;
  while (current <= last) {
    out.push(current);
    current = addDaysIso(current, 1);
  }
  return out;
}

export function weekdayIndexIst(isoDate: string): number {
  return new Date(`${isoDate.slice(0, 10)}T12:00:00+05:30`).getUTCDay();
}

export function isWeekendIso(isoDate: string): boolean {
  const day = weekdayIndexIst(isoDate);
  return day === 0 || day === 6;
}

export function weekdayShortIst(isoDate: string): string {
  return new Date(`${isoDate.slice(0, 10)}T12:00:00+05:30`).toLocaleDateString("en-IN", {
    weekday: "short",
    timeZone: INDIA_TIME_ZONE,
  });
}

export function formatIsoDate(isoDate: string): string {
  return new Date(`${isoDate.slice(0, 10)}T12:00:00+05:30`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: INDIA_TIME_ZONE,
  });
}

export function formatMonthLabel(yyyyMm: string): string {
  return new Date(`${yyyyMm.slice(0, 7)}-01T12:00:00+05:30`).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: INDIA_TIME_ZONE,
  });
}

/** Shift date in IST: 12:00 AM–3:29 AM still belongs to the previous day's 6:30 PM shift. */
export function todayIso(date = new Date()): string {
  const minutes = minutesInTimeZone(date, INDIA_TIME_ZONE);
  const calendar = calendarDateIsoIst(date);
  if (minutes < INDIA_LOGOUT_MINUTES) return addDaysIso(calendar, -1);
  return calendar;
}

export function shiftDateIso(date = new Date()): string {
  return todayIso(date);
}

export function minutesInTimeZone(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    timeZone,
  }).formatToParts(date);
  const hourRaw = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const hour = hourRaw === 24 ? 0 : hourRaw;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function hourInTimeZone(date: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone,
  }).formatToParts(date).find((part) => part.type === "hour")?.value;

  const value = Number(hour ?? 0);
  return value === 24 ? 0 : value;
}

export function greetingForNow(timeZone = INDIA_TIME_ZONE): string {
  const hour = hourInTimeZone(new Date(), timeZone);
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
