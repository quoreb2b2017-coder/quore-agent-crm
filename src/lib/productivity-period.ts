import {
  addDaysIso,
  eachDateInclusive,
  formatIsoDate,
  formatMonthLabel,
  isWeekendIso,
  todayIso,
  weekdayIndexIst,
} from "@/lib/format";
import { isUuid, monthStartEnd } from "@/lib/attendance-period";
import { TRACKING_START_DATE } from "@/lib/shift";

export type ProductivityView = "daily" | "weekly" | "monthly" | "custom";

export type ProductivityQuery = {
  view: ProductivityView;
  employeeId: string | null;
  /** Anchor date for daily and weekly views. */
  date: string;
  month: string;
  start: string;
  end: string;
  label: string;
};

const MAX_CUSTOM_DAYS = 366;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/** Monday of the week containing `iso` (weeks run Monday–Sunday). */
export function weekStartIso(iso: string): string {
  return addDaysIso(iso, -((weekdayIndexIst(iso) + 6) % 7));
}

/**
 * Monday–Friday from the tracking start date onward. Saturday and Sunday are the week off and
 * never count toward targets.
 */
export function workingDatesInRange(start: string, end: string, trackingStart = TRACKING_START_DATE): string[] {
  return eachDateInclusive(start, end).filter((iso) => iso >= trackingStart && !isWeekendIso(iso));
}

function shortDate(iso: string) {
  return formatIsoDate(iso).replace(/^\w+,\s*/, "");
}

export function parseProductivityQuery(
  searchParams: { [key: string]: string | string[] | undefined },
  lockedEmployeeId?: string | null
): ProductivityQuery {
  const today = todayIso();
  const viewRaw = first(searchParams.view);
  const view: ProductivityView =
    viewRaw === "weekly" || viewRaw === "monthly" || viewRaw === "custom" ? viewRaw : "daily";

  const employeeRaw = first(searchParams.employee);
  const employeeId = lockedEmployeeId ?? (isUuid(employeeRaw) ? employeeRaw : null);

  const dateRaw = first(searchParams.date);
  const date = ISO_DATE.test(dateRaw) ? dateRaw : today;
  const monthRaw = first(searchParams.month);
  const month = /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : today.slice(0, 7);

  if (view === "weekly") {
    const start = weekStartIso(date);
    const end = addDaysIso(start, 6);
    return {
      view,
      employeeId,
      date,
      month,
      start,
      end,
      label: `Week of ${shortDate(start)} – ${shortDate(end)}`,
    };
  }

  if (view === "monthly") {
    const { start, end } = monthStartEnd(month);
    return { view, employeeId, date, month, start, end, label: formatMonthLabel(month) };
  }

  if (view === "custom") {
    const fromRaw = first(searchParams.from);
    const toRaw = first(searchParams.to);
    let start = ISO_DATE.test(fromRaw) ? fromRaw : addDaysIso(today, -6);
    let end = ISO_DATE.test(toRaw) ? toRaw : today;
    if (start > end) [start, end] = [end, start];
    if (eachDateInclusive(start, end).length > MAX_CUSTOM_DAYS) {
      start = addDaysIso(end, -(MAX_CUSTOM_DAYS - 1));
    }
    return {
      view,
      employeeId,
      date,
      month,
      start,
      end,
      label: `${shortDate(start)} – ${shortDate(end)}`,
    };
  }

  return { view, employeeId, date, month, start: date, end: date, label: formatIsoDate(date) };
}

/** Same view shifted one period back (-1) or forward (+1). */
export function shiftProductivityPeriod(
  query: Pick<ProductivityQuery, "view" | "date" | "month" | "start" | "end">,
  direction: -1 | 1
): { date?: string; month?: string; from?: string; to?: string } {
  if (query.view === "daily") return { date: addDaysIso(query.date, direction) };
  if (query.view === "weekly") return { date: addDaysIso(query.date, 7 * direction) };
  if (query.view === "monthly") {
    const [year, month] = query.month.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1 + direction, 1));
    return { month: next.toISOString().slice(0, 7) };
  }
  const span = eachDateInclusive(query.start, query.end).length;
  return {
    from: addDaysIso(query.start, span * direction),
    to: addDaysIso(query.end, span * direction),
  };
}
