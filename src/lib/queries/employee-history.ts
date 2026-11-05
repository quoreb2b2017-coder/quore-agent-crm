import { createDataClient as createClient } from "@/lib/supabase/data";
import { createServiceClient } from "@/lib/supabase/service";
import {
  addDaysIso,
  eachDateInclusive,
  formatBreakDuration,
  shiftDateIso,
  todayIso,
  weekdayShortIst,
} from "@/lib/format";
import {
  breakExcess,
  breakSecondsBySlot,
  creditedProductiveSeconds,
  istLocalToUtc,
  productiveTargetSeconds,
  productivityPercent,
  shiftAccountingWindowUtc,
  PRODUCTIVE_SECONDS,
  type BreakExcess,
} from "@/lib/shift";
import { dailyActiveSeconds } from "@/lib/live-time";
import { setupAsOf } from "@/lib/payroll";
import { isUndecidedLeaveType, unpackLeaveNote } from "@/lib/leave";
import { liveSessionSlices } from "@/lib/queries/admin-dashboard";
import { loadAttendanceSheet, type AttendanceSheetRow } from "@/lib/queries/attendance-sheet";
import { loadEffectiveWorkSettings } from "@/lib/work-settings-server";

export type EmployeeHistoryAttendance = AttendanceSheetRow;

export type EmployeeHistoryLeave = {
  id: string;
  start_date: string;
  end_date: string;
  days_count: number;
  status: string;
  leaveType: string;
};

export type EmployeeHistoryPayload = {
  today: string;
  since: string;
  presentDays: number;
  leaveDays: number;
  activeSeconds: number;
  breakSeconds: number;
  idleSeconds: number;
  todayActiveSeconds: number;
  todayProductivityPct: number;
  chartData: {
    day: string;
    activeHours: number;
    otHours: number;
    targetHours: number;
    status: "met" | "short" | "in_progress" | "off" | "upcoming";
  }[];
  attendance: EmployeeHistoryAttendance[];
  /** Attendance sheet: whole months, further back than the 30-day summary. */
  sheetAttendance: EmployeeHistoryAttendance[];
  sheetExcessByDate: Record<string, BreakExcess>;
  timeline: { time: string; label: string }[];
  todayWashroomVisits: number;
  /** Shift date → time over Tea / Lunch. Washroom is logged separately. */
  excessByDate: Record<string, BreakExcess>;
  excessBreakSeconds: number;
  leaves: EmployeeHistoryLeave[];
  payroll: {
    base: number;
    hra: number;
    allowance: number;
    gross: number;
    payFrequency: string;
  } | null;
};

export async function getEmployeeHistory(employeeId: string): Promise<EmployeeHistoryPayload> {
  const supabase = await createClient();
  const today = todayIso();
  const since = addDaysIso(today, -29);
  const chartSince = addDaysIso(today, -6);
  const workSettings = await loadEffectiveWorkSettings(employeeId);
  const { start, end } = shiftAccountingWindowUtc(today, workSettings);
  const rangeStart = istLocalToUtc(since, 0, 0).toISOString();
  const rangeEnd = end.toISOString();

  const service = createServiceClient();
  const [
    { data: attendance },
    sheet,
    { data: breakRows },
    { data: sessions },
    { data: washroomRows },
    { data: meetingRows },
    { data: leaveRows },
    { data: leaveTypes },
    { data: salaryRecords },
    { data: employee },
    live,
  ] = await Promise.all([
    supabase
      .from("attendance")
      .select(
        "id, attendance_date, status, first_check_in, last_check_out, total_active_seconds, total_break_seconds, total_idle_seconds, overtime_minutes, notes"
      )
      .eq("employee_id", employeeId)
      .gte("attendance_date", since)
      .lte("attendance_date", today)
      .order("attendance_date", { ascending: false }),
    loadAttendanceSheet(employeeId, today, rangeEnd),
    supabase
      .from("breaks")
      .select("id, employee_id, break_type, started_at, ended_at, duration_seconds")
      .eq("employee_id", employeeId)
      .gte("started_at", rangeStart)
      .lt("started_at", rangeEnd)
      .order("started_at", { ascending: false }),
    supabase
      .from("employee_sessions")
      .select("started_at, ended_at")
      .eq("employee_id", employeeId)
      .gte("started_at", start.toISOString())
      .lt("started_at", end.toISOString())
      .order("started_at"),
    service
      .from("washroom_visits")
      .select("started_at, ended_at, duration_seconds")
      .eq("employee_id", employeeId)
      .gte("started_at", rangeStart)
      .lt("started_at", rangeEnd)
      .order("started_at"),
    service
      .from("meetings")
      .select("started_at, ended_at, requested_at")
      .eq("employee_id", employeeId)
      .gte("requested_at", start.toISOString())
      .lt("requested_at", end.toISOString())
      .order("requested_at"),
    supabase
      .from("leave_requests")
      .select("id, start_date, end_date, days_count, status, leave_type_id, reason")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("leave_types").select("id, name"),
    supabase
      .from("salary_records")
      .select("employee_id, effective_from, base_salary, pay_frequency, components")
      .eq("employee_id", employeeId)
      .order("effective_from", { ascending: false }),
    supabase.from("employees").select("salary").eq("id", employeeId).maybeSingle(),
    liveSessionSlices(supabase, [employeeId]),
  ]);

  const rows = attendance ?? [];
  const todayRow = rows.find((row) => row.attendance_date === today);
  const byDate = new Map(rows.map((row) => [row.attendance_date, row]));
  const slice = live.get(employeeId);
  const todayLiveSeconds = dailyActiveSeconds({
    storedActiveSeconds: todayRow?.total_active_seconds ?? 0,
    sessionStartedAt: slice?.sessionStartedAt ?? null,
    sessionClosedBreakSeconds: slice?.sessionClosedBreakSeconds ?? 0,
    openBreakStartedAt: slice?.openBreakStartedAt ?? null,
    sessionClosedWashroomSeconds: slice?.sessionClosedWashroomSeconds ?? 0,
    openWashroomStartedAt: slice?.openWashroomStartedAt ?? null,
    settings: workSettings,
    overtimeMinutes: todayRow?.overtime_minutes ?? 0,
  });
  const offStatuses = new Set(["ON_LEAVE", "HOLIDAY", "WEEK_OFF"]);
  const chartData = eachDateInclusive(chartSince, today).map((iso) => {
    const row = byDate.get(iso);
    const seconds =
      iso === today ? todayLiveSeconds : (row?.total_active_seconds ?? 0);
    const credited = creditedProductiveSeconds(seconds, row?.status);
    const targetSeconds = productiveTargetSeconds(row?.status);
    const targetHours = Math.round((targetSeconds / 3600) * 100) / 100;
    const off = row && offStatuses.has(row.status);
    const status = off
      ? ("off" as const)
      : iso === today
        ? credited >= targetSeconds
          ? ("met" as const)
          : ("in_progress" as const)
        : credited >= targetSeconds
          ? ("met" as const)
          : credited > 0 || row
            ? ("short" as const)
            : ("upcoming" as const);
    const otHours = Math.round(((row?.overtime_minutes ?? 0) / 60) * 10) / 10;
    return {
      day: weekdayShortIst(iso),
      activeHours: Math.round((credited / 3600) * 10) / 10,
      otHours,
      targetHours: off ? Math.round((PRODUCTIVE_SECONDS / 3600) * 100) / 100 : targetHours,
      status,
    };
  });

  const typeById = new Map((leaveTypes ?? []).map((item) => [item.id, item.name]));
  const timeline: { time: string; label: string }[] = [];
  for (const session of sessions ?? []) {
    const stayed = session.ended_at
      ? formatBreakDuration(
          Math.max(
            0,
            Math.floor((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000)
          )
        )
      : null;
    timeline.push({ time: session.started_at, label: stayed ? `Logged in · ${stayed}` : "Logged in · still in" });
    if (session.ended_at) timeline.push({ time: session.ended_at, label: `Logged out · ${stayed}` });
  }
  const todayBreaks = (breakRows ?? []).filter(
    (row) => row.started_at >= start.toISOString() && row.started_at < end.toISOString()
  );
  for (const row of todayBreaks) {
    timeline.push({ time: row.started_at, label: `${formatBreakLabel(row.break_type)} started` });
    if (row.ended_at) timeline.push({ time: row.ended_at, label: "Break ended" });
  }
  const todayWashroom = (washroomRows ?? []).filter(
    (row) => row.started_at >= start.toISOString() && row.started_at < end.toISOString()
  );
  for (const row of todayWashroom) {
    timeline.push({ time: row.started_at, label: "Washroom started" });
    if (row.ended_at) timeline.push({ time: row.ended_at, label: "Washroom ended" });
  }
  for (const row of meetingRows ?? []) {
    if (row.started_at) {
      timeline.push({ time: row.started_at, label: "Meeting started (accepted)" });
      if (row.ended_at) timeline.push({ time: row.ended_at, label: "Meeting ended" });
    } else {
      timeline.push({ time: row.requested_at, label: "Meeting requested" });
    }
  }
  timeline.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  const breaksByDate = new Map<string, NonNullable<typeof breakRows>>();
  for (const row of breakRows ?? []) {
    const date = shiftDateIso(new Date(row.started_at));
    breaksByDate.set(date, [...(breaksByDate.get(date) ?? []), row]);
  }
  const excessByDate: Record<string, BreakExcess> = {};
  for (const date of breaksByDate.keys()) {
    if (date < since) continue;
    excessByDate[date] = breakExcess(breakSecondsBySlot(breaksByDate.get(date) ?? []));
  }

  function toHistoryAttendance(row: NonNullable<typeof attendance>[number] | AttendanceSheetRow): EmployeeHistoryAttendance {
    const seconds = row.attendance_date === today ? todayLiveSeconds : row.total_active_seconds;
    return {
      ...row,
      overtime_minutes: row.overtime_minutes ?? 0,
      notes: row.notes ?? null,
      total_active_seconds: creditedProductiveSeconds(seconds, row.status),
    };
  }

  const payroll = setupAsOf(salaryRecords ?? [], employeeId, today, employee?.salary ?? null);

  return {
    today,
    since,
    presentDays: rows.filter((row) => row.status === "PRESENT" || row.status === "LATE" || row.status === "HALF_DAY").length,
    leaveDays: rows.filter((row) => row.status === "ON_LEAVE").length,
    activeSeconds: rows.reduce((sum, row) => {
      const seconds =
        row.attendance_date === today ? todayLiveSeconds : row.total_active_seconds;
      return sum + creditedProductiveSeconds(seconds, row.status);
    }, 0),
    breakSeconds: rows.reduce((sum, row) => sum + row.total_break_seconds, 0),
    idleSeconds: rows.reduce((sum, row) => sum + row.total_idle_seconds, 0),
    todayActiveSeconds: creditedProductiveSeconds(todayLiveSeconds, todayRow?.status),
    todayProductivityPct: productivityPercent(
      creditedProductiveSeconds(todayLiveSeconds, todayRow?.status),
      productiveTargetSeconds(todayRow?.status)
    ),
    chartData,
    attendance: rows.map(toHistoryAttendance),
    sheetAttendance: sheet.rows.map(toHistoryAttendance),
    sheetExcessByDate: sheet.excessByDate,
    timeline,
    todayWashroomVisits: todayWashroom.length,
    excessByDate,
    excessBreakSeconds: Object.values(excessByDate).reduce((sum, item) => sum + item.total, 0),
    leaves: (leaveRows ?? []).map((row) => ({
      id: row.id,
      start_date: row.start_date,
      end_date: row.end_date,
      days_count: Number(row.days_count),
      status: row.status,
      leaveType: (() => {
        const name = typeById.get(row.leave_type_id);
        if (!isUndecidedLeaveType(name)) return name ?? "Leave";
        return unpackLeaveNote(row.reason).subject || "Leave";
      })(),
    })),
    payroll: payroll
      ? {
          base: payroll.base,
          hra: payroll.hra,
          allowance: payroll.allowance,
          gross: payroll.gross,
          payFrequency: payroll.payFrequency,
        }
      : null,
  };
}

function formatBreakLabel(breakType: string) {
  if (breakType === "LUNCH") return "Lunch";
  if (breakType === "TEA") return "Tea";
  if (breakType === "TEA_1") return "Tea 1";
  if (breakType === "TEA_2") return "Tea 2";
  return "Break";
}
