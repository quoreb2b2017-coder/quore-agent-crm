import { monthStartEnd } from "@/lib/attendance-period";
import { addDaysIso, eachDateInclusive, formatIsoDate, formatMonthLabel, todayIso } from "@/lib/format";
import { weekStartIso } from "@/lib/productivity-period";

export type ActivityView = "daily" | "weekly" | "monthly" | "days";

export type ActivityPeriod = {
  view: ActivityView;
  /** Anchor date for the daily and weekly views. */
  date: string;
  month: string;
  dayCount: number;
  start: string;
  end: string;
  dayTotal: number;
  label: string;
};

export const MAX_ACTIVITY_DAYS = 90;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;

type RawParams = { view?: string | null; date?: string | null; month?: string | null; days?: string | null };

/** Reads the period from the URL. Anything invalid or still in the future falls back to today. */
export function parseActivityPeriod(raw: RawParams): ActivityPeriod {
  const today = todayIso();
  const view: ActivityView =
    raw.view === "daily" || raw.view === "weekly" || raw.view === "monthly" ? raw.view : "days";
  const date = raw.date && ISO_DATE.test(raw.date) && raw.date <= today ? raw.date : today;
  const month =
    raw.month && ISO_MONTH.test(raw.month) && raw.month <= today.slice(0, 7) ? raw.month : today.slice(0, 7);
  const parsedDays = Math.floor(Number(raw.days));
  const dayCount = Number.isFinite(parsedDays) ? Math.min(MAX_ACTIVITY_DAYS, Math.max(1, parsedDays)) : 7;

  let start = addDaysIso(today, -(dayCount - 1));
  let end = today;
  let label = dayCount === 1 ? "Today" : `Last ${dayCount} days`;
  if (view === "daily") {
    start = date;
    end = date;
    label = formatIsoDate(date);
  } else if (view === "weekly") {
    start = weekStartIso(date);
    const weekEnd = addDaysIso(start, 6);
    end = weekEnd > today ? today : weekEnd;
    label = `Week of ${formatIsoDate(start)}`;
  } else if (view === "monthly") {
    const bounds = monthStartEnd(month);
    start = bounds.start;
    end = bounds.end > today ? today : bounds.end;
    label = formatMonthLabel(month);
  }

  return { view, date, month, dayCount, start, end, dayTotal: eachDateInclusive(start, end).length, label };
}

export function activityPeriodParams(period: { view: ActivityView; date: string; month: string; dayCount: number | string }) {
  const params = new URLSearchParams({ view: period.view });
  if (period.view === "daily" || period.view === "weekly") params.set("date", period.date);
  if (period.view === "monthly") params.set("month", period.month);
  if (period.view === "days") params.set("days", String(period.dayCount));
  return params;
}
