import { createDataClient as createClient } from "@/lib/supabase/data";
import {
  addDaysIso,
  eachDateInclusive,
  todayIso,
  weekdayShortIst,
} from "@/lib/format";
import { istLocalToUtc, productivityPercent, shiftAccountingWindowUtc } from "@/lib/shift";
import { setupAsOf } from "@/lib/payroll";
import type { BreakRow } from "@/lib/queries/employee-status";

export type EmployeeHistoryAttendance = {
  id: string;
  attendance_date: string;
  status: string;
  first_check_in: string | null;
  last_check_out: string | null;
  total_active_seconds: number;
  total_break_seconds: number;
  total_idle_seconds: number;
};

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
  chartData: { day: string; activeHours: number }[];
  attendance: EmployeeHistoryAttendance[];
  breaks: BreakRow[];
  timeline: { time: string; label: string }[];
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
  const { start, end } = shiftAccountingWindowUtc(today);
  const rangeStart = istLocalToUtc(since, 0, 0).toISOString();
  const rangeEnd = istLocalToUtc(addDaysIso(today, 1), 3, 30).toISOString();

  const [
    { data: attendance },
    { data: breakRows },
    { data: sessions },
    { data: leaveRows },
    { data: leaveTypes },
    { data: salaryRecords },
    { data: employee },
  ] = await Promise.all([
    supabase
      .from("attendance")
      .select(
        "id, attendance_date, status, first_check_in, last_check_out, total_active_seconds, total_break_seconds, total_idle_seconds"
      )
      .eq("employee_id", employeeId)
      .gte("attendance_date", since)
      .lte("attendance_date", today)
      .order("attendance_date", { ascending: false }),
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
    supabase
      .from("leave_requests")
      .select("id, start_date, end_date, days_count, status, leave_type_id")
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
  ]);

  const rows = attendance ?? [];
  const todayRow = rows.find((row) => row.attendance_date === today);
  const byDate = new Map(rows.map((row) => [row.attendance_date, row]));
  const chartData = eachDateInclusive(chartSince, today).map((iso) => {
    const row = byDate.get(iso);
    return {
      day: weekdayShortIst(iso),
      activeHours: row ? Math.round((row.total_active_seconds / 3600) * 10) / 10 : 0,
    };
  });

  const typeById = new Map((leaveTypes ?? []).map((item) => [item.id, item.name]));
  const timeline: { time: string; label: string }[] = [];
  for (const session of sessions ?? []) {
    timeline.push({ time: session.started_at, label: "Logged in" });
    if (session.ended_at) timeline.push({ time: session.ended_at, label: "Logged out" });
  }
  const todayBreaks = (breakRows ?? []).filter(
    (row) => row.started_at >= start.toISOString() && row.started_at < end.toISOString()
  );
  for (const row of todayBreaks) {
    timeline.push({ time: row.started_at, label: `${formatBreakLabel(row.break_type)} started` });
    if (row.ended_at) timeline.push({ time: row.ended_at, label: "Break ended" });
  }
  timeline.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  const payroll = setupAsOf(salaryRecords ?? [], employeeId, today, employee?.salary ?? null);

  return {
    today,
    since,
    presentDays: rows.filter((row) => row.status === "PRESENT" || row.status === "HALF_DAY").length,
    leaveDays: rows.filter((row) => row.status === "ON_LEAVE").length,
    activeSeconds: rows.reduce((sum, row) => sum + row.total_active_seconds, 0),
    breakSeconds: rows.reduce((sum, row) => sum + row.total_break_seconds, 0),
    idleSeconds: rows.reduce((sum, row) => sum + row.total_idle_seconds, 0),
    todayActiveSeconds: todayRow?.total_active_seconds ?? 0,
    todayProductivityPct: productivityPercent(todayRow?.total_active_seconds ?? 0),
    chartData,
    attendance: rows,
    breaks: (breakRows ?? []).map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      employeeName: null,
      breakType: row.break_type,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      durationSeconds: row.duration_seconds,
    })),
    timeline,
    leaves: (leaveRows ?? []).map((row) => ({
      id: row.id,
      start_date: row.start_date,
      end_date: row.end_date,
      days_count: Number(row.days_count),
      status: row.status,
      leaveType: typeById.get(row.leave_type_id) ?? "Leave",
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
  return "Break";
}
