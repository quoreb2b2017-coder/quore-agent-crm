import { addDaysIso } from "@/lib/format";

export type FederalHoliday = { date: string; name: string };

function iso(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function weekday(dateIso: string) {
  return new Date(`${dateIso.slice(0, 10)}T12:00:00Z`).getUTCDay();
}

/** Saturday → Friday before. Sunday → Monday after. OPM observed rule. */
function observe(dateIso: string) {
  const day = weekday(dateIso);
  if (day === 6) return addDaysIso(dateIso, -1);
  if (day === 0) return addDaysIso(dateIso, 1);
  return dateIso;
}

function nthWeekday(year: number, month: number, dow: number, n: number) {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((dow - firstDow + 7) % 7) + (n - 1) * 7;
  return iso(year, month, day);
}

function lastWeekday(year: number, month: number, dow: number) {
  const last = new Date(Date.UTC(year, month, 0));
  const day = last.getUTCDate() - ((last.getUTCDay() - dow + 7) % 7);
  return iso(year, month, day);
}

/** US federal holidays for a calendar year, on the day the office is closed. */
export function federalHolidays(year: number): FederalHoliday[] {
  const fixed = [
    { date: observe(iso(year, 1, 1)), name: "New Year's Day" },
    { date: nthWeekday(year, 1, 1, 3), name: "Birthday of Martin Luther King, Jr." },
    { date: nthWeekday(year, 2, 1, 3), name: "Washington's Birthday" },
    { date: lastWeekday(year, 5, 1), name: "Memorial Day" },
    { date: observe(iso(year, 6, 19)), name: "Juneteenth" },
    { date: observe(iso(year, 7, 4)), name: "Independence Day" },
    { date: nthWeekday(year, 9, 1, 1), name: "Labor Day" },
    { date: nthWeekday(year, 10, 1, 2), name: "Columbus Day" },
    { date: observe(iso(year, 11, 11)), name: "Veterans Day" },
    { date: nthWeekday(year, 11, 4, 4), name: "Thanksgiving Day" },
    { date: observe(iso(year, 12, 25)), name: "Christmas Day" },
  ];
  const byDate = new Map<string, string>();
  for (const holiday of fixed) {
    const existing = byDate.get(holiday.date);
    byDate.set(holiday.date, existing ? `${existing}; ${holiday.name}` : holiday.name);
  }
  return [...byDate.entries()]
    .map(([date, name]) => ({ date, name }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
