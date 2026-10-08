import { createDataClient as createClient } from "@/lib/supabase/data";
import { createServiceClient } from "@/lib/supabase/service";
import { isWeekendIso, shiftDateIso, todayIso } from "@/lib/format";
import {
  breakSecondsBySlot,
  creditedAwaySeconds,
  shiftAccountingWindowUtc,
  type BreakSlot,
} from "@/lib/shift";
import type { CommonDashboardData } from "@/lib/queries/employee-dashboard";

export type MySessionState = {
  isClockedIn: boolean;
  isOnBreak: boolean;
  sessionStartedAt: string | null;
  accruedActiveSeconds: number;
  sessionClosedBreakSeconds: number;
  /** Closed break time this shift per slot (Tea 1, Tea 2, Lunch). */
  closedBreakSeconds: Record<BreakSlot, number>;
  openBreakType: string | null;
  openBreakStartedAt: string | null;
  /** Set only after admin accepts the meeting. */
  meetingStartedAt: string | null;
  /** Waiting for admin to accept. */
  meetingRequestedAt: string | null;
  washroomStartedAt: string | null;
  /** Closed washroom time this shift (all visits today). */
  closedWashroomSeconds: number;
  sessionClosedWashroomSeconds: number;
  onLeave: boolean;
  weekOff: boolean;
};

async function openAwayState(employeeId: string) {
  const service = createServiceClient();
  const [{ data: meeting }, { data: washroom }] = await Promise.all([
    service
      .from("meetings")
      .select("started_at, requested_at")
      .eq("employee_id", employeeId)
      .is("ended_at", null)
      .maybeSingle(),
    service
      .from("washroom_visits")
      .select("started_at")
      .eq("employee_id", employeeId)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    meetingStartedAt: meeting?.started_at ?? null,
    meetingRequestedAt: meeting && !meeting.started_at ? (meeting.requested_at ?? null) : null,
    washroomStartedAt: washroom?.started_at ?? null,
  };
}

async function shiftWashroomSeconds(employeeId: string, startIso: string, endIso: string) {
  const { data } = await createServiceClient()
    .from("washroom_visits")
    .select("session_id, started_at, ended_at, duration_seconds")
    .eq("employee_id", employeeId)
    .gte("started_at", startIso)
    .lt("started_at", endIso);
  const rows = data ?? [];
  const closedWashroomSeconds = rows
    .filter((row) => row.ended_at != null)
    .reduce((sum, row) => sum + (row.duration_seconds ?? 0), 0);
  return {
    closedWashroomSeconds,
    sessionClosedSeconds: (session: { id: string; started_at: string }) =>
      sessionClosedCredited(rows, session),
  };
}

function sessionClosedCredited(
  rows: { session_id: string | null; started_at: string; ended_at: string | null; duration_seconds: number | null }[],
  session: { id: string; started_at: string }
) {
  return rows
    .filter((row) => row.session_id === session.id && row.ended_at != null)
    .reduce((sum, row) => sum + creditedAwaySeconds(session.started_at, row), 0);
}

export type EmployeeDashboardBundle = {
  sessionState: MySessionState;
  commonData: CommonDashboardData;
};

export async function getEmployeeDashboardBundle(employeeId: string): Promise<EmployeeDashboardBundle> {
  const supabase = await createClient();
  const today = todayIso();

  const [{ data: session }, { data: attendance }, { data: tasks }] = await Promise.all([
    supabase
      .from("employee_sessions")
      .select("id, started_at")
      .eq("employee_id", employeeId)
      .eq("status", "ACTIVE")
      .maybeSingle(),
    supabase
      .from("attendance")
      .select("status, total_active_seconds, total_break_seconds, total_idle_seconds")
      .eq("employee_id", employeeId)
      .eq("attendance_date", today)
      .maybeSingle(),
    supabase.from("tasks").select("status").eq("assigned_to", employeeId),
  ]);

  const shiftDate = session ? shiftDateIso(new Date(session.started_at)) : today;
  const { start, end } = shiftAccountingWindowUtc(shiftDate);

  const { data: shiftBreaks } = await supabase
    .from("breaks")
    .select("break_type, ended_at, started_at, duration_seconds, session_id")
    .eq("employee_id", employeeId)
    .gte("started_at", start.toISOString())
    .lt("started_at", end.toISOString());

  const breaks = shiftBreaks ?? [];
  const closedBreakSeconds = breakSecondsBySlot(breaks, { closedOnly: true });

  const weekOff =
    attendance?.status === "WEEK_OFF" || (!attendance && isWeekendIso(shiftDate));
  const openBreak = session
    ? breaks.find((row) => row.session_id === session.id && row.ended_at == null)
    : undefined;

  const taskList = tasks ?? [];
  const commonData: CommonDashboardData = {
    isClockedIn: !!session,
    isOnBreak: !!openBreak,
    activeSeconds: attendance?.total_active_seconds ?? 0,
    breakSeconds: attendance?.total_break_seconds ?? 0,
    idleSeconds: attendance?.total_idle_seconds ?? 0,
    assignedTasks: taskList.length,
    completedTasks: taskList.filter((t) => t.status === "DONE").length,
    pendingTasks: taskList.filter((t) => !["DONE", "CANCELLED"].includes(t.status)).length,
  };

  if (!session) {
    return {
      sessionState: {
        isClockedIn: false,
        isOnBreak: false,
        sessionStartedAt: null,
        accruedActiveSeconds: attendance?.total_active_seconds ?? 0,
        sessionClosedBreakSeconds: 0,
        closedBreakSeconds,
        openBreakType: null,
        openBreakStartedAt: null,
        meetingStartedAt: null,
        meetingRequestedAt: null,
        washroomStartedAt: null,
        closedWashroomSeconds: 0,
        sessionClosedWashroomSeconds: 0,
        onLeave: attendance?.status === "ON_LEAVE",
        weekOff,
      },
      commonData,
    };
  }

  const [away, washroom] = await Promise.all([
    openAwayState(employeeId),
    shiftWashroomSeconds(employeeId, start.toISOString(), end.toISOString()),
  ]);

  return {
    sessionState: {
      isClockedIn: true,
      isOnBreak: !!openBreak,
      sessionStartedAt: session.started_at,
      accruedActiveSeconds: attendance?.total_active_seconds ?? 0,
      sessionClosedBreakSeconds: sessionClosedCredited(breaks, session),
      closedBreakSeconds,
      openBreakType: openBreak?.break_type ?? null,
      openBreakStartedAt: openBreak?.started_at ?? null,
      meetingStartedAt: away.meetingStartedAt,
      meetingRequestedAt: away.meetingRequestedAt,
      washroomStartedAt: away.washroomStartedAt,
      closedWashroomSeconds: washroom.closedWashroomSeconds,
      sessionClosedWashroomSeconds: washroom.sessionClosedSeconds(session),
      onLeave: attendance?.status === "ON_LEAVE",
      weekOff,
    },
    commonData,
  };
}

export async function getMySessionState(employeeId: string): Promise<MySessionState> {
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("employee_sessions")
    .select("id, started_at")
    .eq("employee_id", employeeId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  const shiftDate = session ? shiftDateIso(new Date(session.started_at)) : todayIso();
  const { start, end } = shiftAccountingWindowUtc(shiftDate);

  const [{ data: attendance }, { data: shiftBreaks }] = await Promise.all([
    supabase
      .from("attendance")
      .select("status, total_active_seconds")
      .eq("employee_id", employeeId)
      .eq("attendance_date", shiftDate)
      .maybeSingle(),
    supabase
      .from("breaks")
      .select("break_type, ended_at, started_at, duration_seconds, session_id")
      .eq("employee_id", employeeId)
      .gte("started_at", start.toISOString())
      .lt("started_at", end.toISOString()),
  ]);

  const breaks = shiftBreaks ?? [];
  const closedBreakSeconds = breakSecondsBySlot(breaks, { closedOnly: true });

  const weekOff =
    attendance?.status === "WEEK_OFF" || (!attendance && isWeekendIso(shiftDate));

  if (!session) {
    return {
      isClockedIn: false,
      isOnBreak: false,
      sessionStartedAt: null,
      accruedActiveSeconds: attendance?.total_active_seconds ?? 0,
      sessionClosedBreakSeconds: 0,
      closedBreakSeconds,
        openBreakType: null,
        openBreakStartedAt: null,
        meetingStartedAt: null,
        meetingRequestedAt: null,
        washroomStartedAt: null,
        closedWashroomSeconds: 0,
        sessionClosedWashroomSeconds: 0,
        onLeave: attendance?.status === "ON_LEAVE",
      weekOff,
    };
  }

  const openBreak = breaks.find((row) => row.session_id === session.id && row.ended_at == null);

  const [away, washroom] = await Promise.all([
    openAwayState(employeeId),
    shiftWashroomSeconds(employeeId, start.toISOString(), end.toISOString()),
  ]);

  return {
    isClockedIn: true,
    isOnBreak: !!openBreak,
    sessionStartedAt: session.started_at,
    accruedActiveSeconds: attendance?.total_active_seconds ?? 0,
    sessionClosedBreakSeconds: sessionClosedCredited(breaks, session),
    closedBreakSeconds,
    openBreakType: openBreak?.break_type ?? null,
    openBreakStartedAt: openBreak?.started_at ?? null,
    meetingStartedAt: away.meetingStartedAt,
    meetingRequestedAt: away.meetingRequestedAt,
    washroomStartedAt: away.washroomStartedAt,
    closedWashroomSeconds: washroom.closedWashroomSeconds,
    sessionClosedWashroomSeconds: washroom.sessionClosedSeconds(session),
    onLeave: attendance?.status === "ON_LEAVE",
    weekOff,
  };
}

export type MyTodayAttendance = {
  totalActiveSeconds: number;
  totalBreakSeconds: number;
  status: string;
};

export async function getMyTodayAttendance(employeeId: string): Promise<MyTodayAttendance | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("attendance")
    .select("total_active_seconds, total_break_seconds, status")
    .eq("employee_id", employeeId)
    .eq("attendance_date", todayIso())
    .maybeSingle();

  if (!data) return null;
  return {
    totalActiveSeconds: data.total_active_seconds,
    totalBreakSeconds: data.total_break_seconds,
    status: data.status,
  };
}

export type BreakRow = {
  id: string;
  employeeId: string;
  employeeName: string | null;
  breakType: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
};

export async function getRecentBreaks(options?: {
  employeeId?: string;
  limit?: number;
}): Promise<BreakRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("breaks")
    .select("id, employee_id, break_type, started_at, ended_at, duration_seconds")
    .order("started_at", { ascending: false })
    .limit(options?.limit ?? 8);
  if (options?.employeeId) query = query.eq("employee_id", options.employeeId);

  const { data: rows } = await query;
  if (!rows || rows.length === 0) return [];

  const employeeIds = Array.from(new Set(rows.map((row) => row.employee_id)));
  const { data: employees } = await supabase
    .from("employees")
    .select("id, full_name")
    .in("id", employeeIds);
  const nameById = new Map((employees ?? []).map((employee) => [employee.id, employee.full_name]));

  return rows.map((row) => ({
    id: row.id,
    employeeId: row.employee_id,
    employeeName: nameById.get(row.employee_id) ?? null,
    breakType: row.break_type,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
  }));
}
