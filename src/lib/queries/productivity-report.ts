import { createDataClient as createClient } from "@/lib/supabase/data";
import { createServiceClient } from "@/lib/supabase/service";
import { shiftDateIso, todayIso } from "@/lib/format";
import { formatLeaveComment } from "@/lib/leave";
import { leaveNotesByDay } from "@/lib/queries/leave";
import {
  applyAttendanceShiftSnapshot,
  applyWorkSchedule,
  formatMinutesLabel,
  parseWorkSchedule,
} from "@/lib/work-settings";
import { loadEmployeeWorkSettingsMap, loadWorkSettings } from "@/lib/work-settings-server";
import { dailyActiveSeconds } from "@/lib/live-time";
import {
  breakExcess,
  breakSecondsBySlot,
  addExcess,
  emptyExcess,
  isLateClockIn,
  creditedProductiveSeconds,
  productiveTargetSeconds,
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
  /** 7h 45m, or half of that when the day is marked half day. */
  targetSeconds: number;
  breakSeconds: number;
  idleSeconds: number;
  /** Time over Tea 1 / Tea 2 / Lunch that shift. Washroom is logged separately. */
  breakExcess: BreakExcess;
  status: DayStatus;
  /** Off reason when status is "off" (leave or holiday). */
  offStatus: string | null;
  /** Stored attendance status, including LATE. */
  attendanceStatus: string | null;
  /** Leave subject and reason, shown when the day is hovered. */
  leaveComment: string | null;
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
  overtime_minutes: number;
  notes: string | null;
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
  const [company, settingsByEmployee] = await Promise.all([
    loadWorkSettings(),
    loadEmployeeWorkSettingsMap(employeeIds),
  ]);
  const settingsList = [company, ...employeeIds.map((id) => settingsByEmployee.get(id) ?? company)];
  let startMs = Infinity;
  let endMs = -Infinity;
  for (const settings of settingsList) {
    startMs = Math.min(startMs, shiftAccountingWindowUtc(start, settings).start.getTime());
    endMs = Math.max(endMs, shiftAccountingWindowUtc(end, settings).end.getTime());
  }
  const windowStart = new Date(startMs).toISOString();
  const windowEnd = new Date(endMs).toISOString();
  const rows: AwayRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await client
      .from(table)
      .select(columns)
      .in("employee_id", employeeIds)
      .gte("started_at", windowStart)
      .lt("started_at", windowEnd)
      .order("started_at")
      .range(from, from + PAGE_SIZE - 1);
    rows.push(...((data ?? []) as unknown as AwayRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

/** employee id → shift date → excess break for that shift. Washroom visits are not break time. */
async function loadBreakExcess(employeeIds: string[], start: string, end: string) {
  const breaks = await loadAwayRows("breaks", employeeIds, start, end);
  const grouped = new Map<string, AwayRow[]>();
  for (const row of breaks) {
    const key = `${row.employee_id}|${shiftDateIso(new Date(row.started_at))}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  const result = new Map<string, Map<string, BreakExcess>>();
  for (const [key, rows] of grouped) {
    const [employeeId, date] = key.split("|");
    const used = breakSecondsBySlot(rows.map((row) => ({ ...row, break_type: row.break_type ?? "TEA_1" })));
    const byDate = result.get(employeeId) ?? new Map<string, BreakExcess>();
    byDate.set(date, breakExcess(used));
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
        "employee_id, attendance_date, status, total_active_seconds, total_break_seconds, total_idle_seconds, overtime_minutes, notes"
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

function leaveCommentFor(
  employeeId: string,
  date: string,
  row: AttendanceRow | undefined,
  leaveNotes: Awaited<ReturnType<typeof leaveNotesByDay>>
) {
  const request = leaveNotes.get(`${employeeId}|${date}`);
  if (request?.reason) {
    return request.subject && request.subject !== request.reason
      ? `${request.subject} — ${request.reason}`
      : request.reason;
  }
  if (row?.status !== "ON_LEAVE") return null;
  const note = formatLeaveComment(row.notes);
  return note.reason || null;
}

/**
 * Marks Present → Late only for *today*, using that day's frozen shift when present.
 * Never rewrite older days against a newly changed work_schedule.
 */
async function syncLateClockIns(employeeIds: string[], start: string, end: string) {
  if (employeeIds.length === 0) return false;
  const today = todayIso();
  if (today < start || today > end) return false;

  const service = createServiceClient();
  const company = await loadWorkSettings();
  const schedulesPromise = service
    .from("employees")
    .select("id, work_schedule")
    .in("id", employeeIds);

  let data: {
    id: string;
    employee_id: string;
    first_check_in: string | null;
    shift_login_minutes?: number | null;
    shift_logout_minutes?: number | null;
  }[] | null = null;

  const withSnapshot = await service
    .from("attendance")
    .select("id, employee_id, first_check_in, shift_login_minutes, shift_logout_minutes")
    .in("employee_id", employeeIds)
    .eq("attendance_date", today)
    .eq("status", "PRESENT")
    .not("first_check_in", "is", null);
  if (!withSnapshot.error) {
    data = withSnapshot.data;
  } else if (/shift_login_minutes|shift_logout_minutes/i.test(withSnapshot.error.message)) {
    const basic = await service
      .from("attendance")
      .select("id, employee_id, first_check_in")
      .in("employee_id", employeeIds)
      .eq("attendance_date", today)
      .eq("status", "PRESENT")
      .not("first_check_in", "is", null);
    data = basic.data;
  } else {
    return false;
  }

  const { data: schedules } = await schedulesPromise;
  const settingsByEmployee = new Map(
    (schedules ?? []).map((row) => [
      row.id,
      applyWorkSchedule(company, parseWorkSchedule(row.work_schedule)),
    ])
  );
  const lateByNote = new Map<string, string[]>();
  for (const row of data ?? []) {
    if (!row.first_check_in) continue;
    const current = settingsByEmployee.get(row.employee_id) ?? company;
    const settings = applyAttendanceShiftSnapshot(current, row);
    if (!isLateClockIn(row.first_check_in, settings)) continue;
    const note = `Late after ${formatMinutesLabel(settings.loginMinutes, settings.timeZone)}`;
    const ids = lateByNote.get(note) ?? [];
    ids.push(row.id);
    lateByNote.set(note, ids);
  }
  for (const [notes, ids] of lateByNote) {
    await service.from("attendance").update({ status: "LATE", notes }).in("id", ids);
  }
  return lateByNote.size > 0;
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
  const [lateChanged, firstAttendance, live, { data: joining }, excessByEmployee, leaveNotes, settingsByEmployee, company] = await Promise.all([
    syncLateClockIns(ids, start, end),
    loadAttendance(ids, start, end),
    today >= start && today <= end ? liveSessionSlices(supabase, ids) : Promise.resolve(null),
    supabase.from("employees").select("id, joining_date").in("id", ids),
    loadBreakExcess(ids, start, end),
    leaveNotesByDay(ids, start, end),
    loadEmployeeWorkSettingsMap(ids),
    loadWorkSettings(),
  ]);
  // Read again only on the rare load that just marked someone Late.
  const attendance = lateChanged ? await loadAttendance(ids, start, end) : firstAttendance;
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
    const settings = settingsByEmployee.get(employee.id) ?? company;
    const days: ProductivityDay[] = weekdays.map((date) => {
      const row = rows.get(date);
      const workedSeconds =
        date === today
          ? dailyActiveSeconds({
              storedActiveSeconds: row?.total_active_seconds ?? 0,
              sessionStartedAt: slice?.sessionStartedAt ?? null,
              sessionClosedBreakSeconds: slice?.sessionClosedBreakSeconds ?? 0,
              openBreakStartedAt: slice?.openBreakStartedAt ?? null,
              sessionClosedWashroomSeconds: slice?.sessionClosedWashroomSeconds ?? 0,
              openWashroomStartedAt: slice?.openWashroomStartedAt ?? null,
              settings,
              overtimeMinutes: row?.overtime_minutes ?? 0,
            })
          : (row?.total_active_seconds ?? 0);
      const off = row && OFF_STATUSES.has(row.status) ? row.status : null;
      const targetSeconds = productiveTargetSeconds(row?.status);
      const productiveSeconds = creditedProductiveSeconds(workedSeconds, row?.status);
      const status: DayStatus = off
        ? "off"
        : productiveSeconds >= targetSeconds
          ? "met"
          : date > today
            ? "upcoming"
            : date === today
              ? "in_progress"
              : "short";
      return {
        date,
        productiveSeconds,
        targetSeconds,
        breakSeconds: row?.total_break_seconds ?? 0,
        idleSeconds: row?.total_idle_seconds ?? 0,
        breakExcess: excessByDate?.get(date) ?? emptyExcess(),
        status,
        offStatus: off,
        attendanceStatus: row?.status ?? null,
        leaveComment: leaveCommentFor(employee.id, date, row, leaveNotes),
      };
    });

    const working = days.filter((day) => day.status !== "off");
    const counted = working.filter((day) => day.date <= today);
    const finished = working.filter((day) => day.date < today);
    const remaining = working.filter((day) => day.date >= today);
    const productiveSeconds = counted.reduce((sum, day) => sum + day.productiveSeconds, 0);
    const periodTargetSeconds = working.reduce((sum, day) => sum + day.targetSeconds, 0);
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
        finished.reduce((sum, day) => sum + day.targetSeconds, 0),
      periodTargetSeconds,
      remainingDays: remaining.length,
      neededPerDaySeconds: remaining.length > 0 ? Math.ceil(gap / remaining.length) : 0,
      days,
    };
  });
}
