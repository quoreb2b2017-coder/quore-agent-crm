import { todayIso } from "@/lib/format";

export type AttendanceView = "daily" | "monthly" | "yearly";

export type AttendanceQuery = {
  view: AttendanceView;
  employeeId: string | null;
  date: string;
  month: string;
  year: string;
  start: string;
  end: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function monthStartEnd(yyyyMm: string): { start: string; end: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(yyyyMm);
  if (!match) return monthStartEnd(todayIso().slice(0, 7));
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return monthStartEnd(todayIso().slice(0, 7));
  const start = `${match[1]}-${match[2]}-01`;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { start, end };
}

export function yearStartEnd(year: string): { start: string; end: string } {
  const y = /^\d{4}$/.test(year) ? year : todayIso().slice(0, 4);
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

export function yearOptions(fromYear = 2024): string[] {
  const current = Number(todayIso().slice(0, 4));
  const years: string[] = [];
  for (let year = current; year >= fromYear; year -= 1) {
    years.push(String(year));
  }
  return years;
}

export function parseAttendanceQuery(
  searchParams: { [key: string]: string | string[] | undefined },
  lockedEmployeeId?: string | null
): AttendanceQuery {
  const today = todayIso();
  const viewRaw = first(searchParams.view);
  const view: AttendanceView =
    viewRaw === "monthly" || viewRaw === "yearly" ? viewRaw : "daily";

  const employeeRaw = first(searchParams.employee);
  const employeeId = lockedEmployeeId
    ? lockedEmployeeId
    : isUuid(employeeRaw)
      ? employeeRaw
      : null;

  const dateRaw = first(searchParams.date);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : today;

  const monthRaw = first(searchParams.month);
  const month = /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : today.slice(0, 7);

  const yearRaw = first(searchParams.year);
  const year = /^\d{4}$/.test(yearRaw) ? yearRaw : today.slice(0, 4);

  if (view === "daily") {
    return { view, employeeId, date, month, year, start: date, end: date };
  }
  if (view === "monthly") {
    const range = monthStartEnd(month);
    return { view, employeeId, date, month, year, ...range };
  }
  const range = yearStartEnd(year);
  return { view, employeeId, date, month, year, ...range };
}

export type AttendanceCounts = {
  present: number;
  absent: number;
  leave: number;
  halfDay: number;
  other: number;
  records: number;
  activeSeconds: number;
  breakSeconds: number;
};

export function emptyAttendanceCounts(): AttendanceCounts {
  return {
    present: 0,
    absent: 0,
    leave: 0,
    halfDay: 0,
    other: 0,
    records: 0,
    activeSeconds: 0,
    breakSeconds: 0,
  };
}

export function addAttendanceRow(
  counts: AttendanceCounts,
  row: { status: string; total_active_seconds: number; total_break_seconds: number }
): void {
  counts.records += 1;
  counts.activeSeconds += row.total_active_seconds ?? 0;
  counts.breakSeconds += row.total_break_seconds ?? 0;
  if (row.status === "PRESENT") counts.present += 1;
  else if (row.status === "ABSENT") counts.absent += 1;
  else if (row.status === "ON_LEAVE") counts.leave += 1;
  else if (row.status === "HALF_DAY") counts.halfDay += 1;
  else counts.other += 1;
}

export function monthKeysForYear(year: string): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}
