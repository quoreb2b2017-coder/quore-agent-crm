import { createDataClient as createClient } from "@/lib/supabase/data";
import { todayIso } from "@/lib/format";
import { dailyActiveSeconds } from "@/lib/live-time";
import { PRODUCTIVE_SECONDS, TRACKING_START_DATE } from "@/lib/shift";
import { liveSessionSlices } from "@/lib/queries/admin-dashboard";
import { workingDatesInRange } from "@/lib/productivity-period";

/** Days that never carry a productive target, besides Saturday and Sunday. */
const OFF_STATUSES = new Set(["ON_LEAVE", "HOLIDAY", "WEEK_OFF"]);
const PAGE_SIZE = 1000;

export type DayStatus = "met" | "short" | "in_progress" | "upcoming" | "off";

export type ProductivityDay = {
  date: string;
  productiveSeconds: number;
  breakSeconds: number;
  idleSeconds: number;
  status: DayStatus;
  /** Off reason when status is "off" (leave or holiday). */
  offStatus: string | null;
};

export type ProductivityRow = {
  employee: { id: string; full_name: string; employee_code: string };
  /** First counted date: the later of the tracking start and the joining date. */
  trackingStart: string;
  productiveSeconds: number;
  breakSeconds: number;
  idleSeconds: number;
  /** Working days (Mon–Fri, excluding leave/holiday) in the whole period. */
  workingDays: number;
  /** Working days up to and including today. */
  countedDays: number;
  daysMet: number;
  /** Productive minus target over finished working days (before today). Negative is a deficit. */
  balanceSeconds: number;
  /** Target for every working day in the period. */
  periodTargetSeconds: number;
  /** Working days from today to the period end. */
  remainingDays: number;
  /** Productive time per remaining day needed to reach the period target. */
  neededPerDaySeconds: number;
  days: ProductivityDay[];
};

type AttendanceRow = {
  employee_id: string;
  attendance_date: string;
  status: string;
  total_active_seconds: number;
  total_break_seconds: number;
  total_idle_seconds: number;
};

async function loadAttendance(employeeIds: string[], start: string, end: string) {
  const supabase = await createClient();
  const rows: AttendanceRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await supabase
      .from("attendance")
      .select(
        "employee_id, attendance_date, status, total_active_seconds, total_break_seconds, total_idle_seconds"
      )
      .in("employee_id", employeeIds)
      .gte("attendance_date", start)
      .lte("attendance_date", end)
      .order("attendance_date")
      .range(from, from + PAGE_SIZE - 1);
    rows.push(...((data ?? []) as AttendanceRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function getProductivityReport(
  employees: { id: string; full_name: string; employee_code: string }[],
  start: string,
  end: string
): Promise<ProductivityRow[]> {
  if (employees.length === 0) return [];
  const today = todayIso();
  const ids = employees.map((employee) => employee.id);
  const supabase = await createClient();
  const [attendance, live, { data: joining }] = await Promise.all([
    loadAttendance(ids, start, end),
    today >= start && today <= end ? liveSessionSlices(supabase, ids) : Promise.resolve(null),
    supabase.from("employees").select("id, joining_date").in("id", ids),
  ]);
  const joiningById = new Map((joining ?? []).map((row) => [row.id, row.joining_date]));

  const byEmployee = new Map<string, Map<string, AttendanceRow>>();
  for (const row of attendance) {
    const map = byEmployee.get(row.employee_id) ?? new Map<string, AttendanceRow>();
    map.set(row.attendance_date, row);
    byEmployee.set(row.employee_id, map);
  }

  return employees.map((employee) => {
    const joined = joiningById.get(employee.id)?.slice(0, 10) ?? "";
    const trackingStart = joined > TRACKING_START_DATE ? joined : TRACKING_START_DATE;
    const weekdays = workingDatesInRange(start, end, trackingStart);
    const rows = byEmployee.get(employee.id) ?? new Map<string, AttendanceRow>();
    const slice = live?.get(employee.id);
    const days: ProductivityDay[] = weekdays.map((date) => {
      const row = rows.get(date);
      const productiveSeconds =
        date === today
          ? dailyActiveSeconds({
              storedActiveSeconds: row?.total_active_seconds ?? 0,
              sessionStartedAt: slice?.sessionStartedAt ?? null,
              sessionClosedBreakSeconds: slice?.sessionClosedBreakSeconds ?? 0,
              openBreakStartedAt: slice?.openBreakStartedAt ?? null,
              sessionClosedWashroomSeconds: slice?.sessionClosedWashroomSeconds ?? 0,
              openWashroomStartedAt: slice?.openWashroomStartedAt ?? null,
            })
          : (row?.total_active_seconds ?? 0);
      const off = row && OFF_STATUSES.has(row.status) ? row.status : null;
      const status: DayStatus = off
        ? "off"
        : productiveSeconds >= PRODUCTIVE_SECONDS
          ? "met"
          : date > today
            ? "upcoming"
            : date === today
              ? "in_progress"
              : "short";
      return {
        date,
        productiveSeconds,
        breakSeconds: row?.total_break_seconds ?? 0,
        idleSeconds: row?.total_idle_seconds ?? 0,
        status,
        offStatus: off,
      };
    });

    const working = days.filter((day) => day.status !== "off");
    const counted = working.filter((day) => day.date <= today);
    const finished = working.filter((day) => day.date < today);
    const remaining = working.filter((day) => day.date >= today);
    const productiveSeconds = counted.reduce((sum, day) => sum + day.productiveSeconds, 0);
    const periodTargetSeconds = working.length * PRODUCTIVE_SECONDS;
    const gap = Math.max(0, periodTargetSeconds - productiveSeconds);

    return {
      employee,
      trackingStart,
      productiveSeconds,
      breakSeconds: days.reduce((sum, day) => sum + day.breakSeconds, 0),
      idleSeconds: days.reduce((sum, day) => sum + day.idleSeconds, 0),
      workingDays: working.length,
      countedDays: counted.length,
      daysMet: counted.filter((day) => day.status === "met").length,
      balanceSeconds:
        finished.reduce((sum, day) => sum + day.productiveSeconds, 0) -
        finished.length * PRODUCTIVE_SECONDS,
      periodTargetSeconds,
      remainingDays: remaining.length,
      neededPerDaySeconds: remaining.length > 0 ? Math.ceil(gap / remaining.length) : 0,
      days,
    };
  });
}
