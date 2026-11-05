import { createDataClient as createClient } from "@/lib/supabase/data";
import { shiftDateIso } from "@/lib/format";
import { breakExcess, breakSecondsBySlot, istLocalToUtc, type BreakExcess } from "@/lib/shift";

export type AttendanceSheetRow = {
  id: string;
  attendance_date: string;
  status: string;
  first_check_in: string | null;
  last_check_out: string | null;
  total_active_seconds: number;
  total_break_seconds: number;
  total_idle_seconds: number;
  overtime_minutes: number;
  notes: string | null;
};

const SHEET_MONTHS = 12;
const PAGE_SIZE = 1000;

/** First day of the oldest month shown on the attendance sheet. */
export function sheetStartIso(today: string) {
  const [year, month] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month - SHEET_MONTHS, 1)).toISOString().slice(0, 10);
}

/** Whole months of attendance with each day's excess break. RLS decides whose rows the viewer may read. */
export async function loadAttendanceSheet(employeeId: string, today: string, rangeEnd: string) {
  const supabase = await createClient();
  const since = sheetStartIso(today);

  // A year of breaks can pass the 1000-row API limit, which would lose the older months.
  const breaksByDate = new Map<
    string,
    { break_type: string; started_at: string; ended_at: string | null; duration_seconds: number | null }[]
  >();
  async function loadBreaks() {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data } = await supabase
        .from("breaks")
        .select("break_type, started_at, ended_at, duration_seconds")
        .eq("employee_id", employeeId)
        .gte("started_at", istLocalToUtc(since, 0, 0).toISOString())
        .lt("started_at", rangeEnd)
        .order("started_at")
        .range(from, from + PAGE_SIZE - 1);
      for (const row of data ?? []) {
        const date = shiftDateIso(new Date(row.started_at));
        if (date < since) continue;
        breaksByDate.set(date, [...(breaksByDate.get(date) ?? []), row]);
      }
      if (!data || data.length < PAGE_SIZE) break;
    }
  }

  const [{ data: attendance }] = await Promise.all([
    supabase
      .from("attendance")
      .select(
        "id, attendance_date, status, first_check_in, last_check_out, total_active_seconds, total_break_seconds, total_idle_seconds, overtime_minutes, notes"
      )
      .eq("employee_id", employeeId)
      .gte("attendance_date", since)
      .lte("attendance_date", today)
      .order("attendance_date", { ascending: false }),
    loadBreaks(),
  ]);

  const excessByDate: Record<string, BreakExcess> = {};
  for (const [date, dayBreaks] of breaksByDate) {
    excessByDate[date] = breakExcess(breakSecondsBySlot(dayBreaks));
  }

  return {
    since,
    rows: (attendance ?? []).map((row) => ({
      ...row,
      overtime_minutes: row.overtime_minutes ?? 0,
      notes: row.notes ?? null,
    })) as AttendanceSheetRow[],
    excessByDate,
  };
}
