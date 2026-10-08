import { createDataClient as createClient } from "@/lib/supabase/data";
import { createServiceClient } from "@/lib/supabase/service";
import { shiftDateIso, todayIso } from "@/lib/format";
import { dailyActiveSeconds } from "@/lib/live-time";
import {
  breakDurationSeconds,
  breakExcess,
  breakSecondsBySlot,
  addExcess,
  emptyExcess,
  PRODUCTIVE_SECONDS,
  shiftAccountingWindowUtc,
  TRACKING_START_DATE,
  type BreakExcess,
} from "@/lib/shift";
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
  /** Time over Tea 1 / Tea 2 / Lunch / washroom allowance that shift. */
  breakExcess: BreakExcess;
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
  /** Excess break summed over every day in the period. */
  breakExcess: BreakExcess;
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

type AwayRow = {
  employee_id: string;
  break_type?: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
};

async function loadAwayRows(table: "breaks" | "washroom_visits", employeeIds: string[], start: string, end: string) {
  const client = table === "breaks" ? await createClient() : createServiceClient();
  const columns =
    table === "breaks"
      ? "employee_id, break_type, started_at, ended_at, duration_seconds"
      : "employee_id, started_at, ended_at, duration_seconds";
  const rows: AwayRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await client
      .from(table)
      .select(columns)
      .in("employee_id", employeeIds)
      .gte("started_at", shiftAccountingWindowUtc(start).start.toISOString())
      .lt("started_at", shiftAccountingWindowUtc(end).end.toISOString())
      .order("started_at")
      .range(from, from + PAGE_SIZE - 1);
    rows.push(...((data ?? []) as unknown as AwayRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

/** employee id → shift date → excess break for that shift. */
async function loadBreakExcess(employeeIds: string[], start: string, end: string) {
  const [breaks, washroom] = await Promise.all([
    loadAwayRows("breaks", employeeIds, start, end),
    loadAwayRows("washroom_visits", employeeIds, start, end),
  ]);
  const grouped = new Map<string, { breaks: AwayRow[]; washroomSeconds: number }>();
  const bucket = (row: AwayRow) => {
    const key = `${row.employee_id}|${shiftDateIso(new Date(row.started_at))}`;
    let entry = grouped.get(key);
    if (!entry) {
      entry = { breaks: [], washroomSeconds: 0 };
      grouped.set(key, entry);
    }
    return entry;
  };
  for (const row of breaks) bucket(row).breaks.push(row);
  for (const row of washroom) bucket(row).washroomSeconds += breakDurationSeconds(row);

  const result = new Map<string, Map<string, BreakExcess>>();
  for (const [key, entry] of grouped) {
    const [employeeId, date] = key.split("|");
    const used = breakSecondsBySlot(
      entry.breaks.map((row) => ({ ...row, break_type: row.break_type ?? "TEA_1" }))
    );
    const byDate = result.get(employeeId) ?? new Map<string, BreakExcess>();
    byDate.set(date, breakExcess(used, entry.washroomSeconds));
    result.set(employeeId, byDate);
  }
  return result;
}

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
  const [attendance, live, { data: joining }, excessByEmployee] = await Promise.all([
    loadAttendance(ids, start, end),
    today >= start && today <= end ? liveSessionSlices(supabase, ids) : Promise.resolve(null),
    supabase.from("employees").select("id, joining_date").in("id", ids),
    loadBreakExcess(ids, start, end),
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
    const excessByDate = excessByEmployee.get(employee.id);
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
        breakExcess: excessByDate?.get(date) ?? emptyExcess(),
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
      breakExcess: [...(excessByDate?.values() ?? [])].reduce(addExcess, emptyExcess()),
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
