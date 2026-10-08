"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentEmployeeContext, isSuperAdmin } from "@/lib/permissions/server";
import { isSuperAdminEmployee } from "@/lib/queries/admin-dashboard";
import { isWeekendIso, shiftDateIso } from "@/lib/format";
import { ensureWeekendOff } from "@/lib/attendance-weekend";
import {
  BREAK_SLOTS,
  breakSecondsBySlot,
  formatBreakType,
  fromDatetimeLocalIst,
  shiftAccountingWindowUtc,
  creditedAwaySeconds,
  creditedWorkBounds,
  isLateClockIn,
  slotBudgetSeconds,
  type PolicyBreakType,
} from "@/lib/shift";
import { ADMIN_LOGOUT_TYPE, insertAndEmitNotification, notifySuperAdmins } from "@/lib/realtime/notify";

type Result = { error?: string; activated?: boolean; skipped?: boolean };

const ATTENDANCE_STATUSES = [
  "PRESENT",
  "LATE",
  "ABSENT",
  "HALF_DAY",
  "ON_LEAVE",
  "HOLIDAY",
  "WEEK_OFF",
] as const;

function revalidateLive() {
  revalidatePath("/portal/dashboard");
  revalidatePath("/portal/attendance");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/attendance");
}

async function attendanceForShift(
  supabase: Awaited<ReturnType<typeof createClient>>,
  employeeId: string,
  shiftDate: string
) {
  const { data } = await supabase
    .from("attendance")
    .select("id, status, first_check_in, last_check_out, total_active_seconds, total_break_seconds, total_idle_seconds")
    .eq("employee_id", employeeId)
    .eq("attendance_date", shiftDate)
    .maybeSingle();
  return data;
}

async function ensureAttendanceRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  employeeId: string,
  shiftDate: string
) {
  const existing = await attendanceForShift(supabase, employeeId, shiftDate);
  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("attendance")
    .insert({ employee_id: employeeId, attendance_date: shiftDate, status: "PRESENT" })
    .select("id, status, first_check_in, last_check_out, total_active_seconds, total_break_seconds, total_idle_seconds")
    .single();

  if (error || !created) throw new Error(error?.message ?? "Failed to create attendance row");
  return created;
}

const BLOCKED_CLOCK_STATUSES = new Set(["ON_LEAVE", "HOLIDAY", "WEEK_OFF"]);

async function markPresent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  employeeId: string,
  shiftDate: string
) {
  const row = await attendanceForShift(supabase, employeeId, shiftDate);
  if (row && BLOCKED_CLOCK_STATUSES.has(row.status)) return row;
  const now = new Date();
  // Keep what is already recorded (e.g. Half day set by admin); only a new or Absent row is re-marked.
  const status =
    row && row.status !== "ABSENT" ? row.status : isLateClockIn(now) ? "LATE" : "PRESENT";

  if (!row) {
    const payload = {
      employee_id: employeeId,
      attendance_date: shiftDate,
      status,
      first_check_in: now.toISOString(),
      notes: status === "LATE" ? "Late after 7:00 PM IST" : null,
    };
    const { data: created, error } = await supabase
      .from("attendance")
      .insert(payload)
      .select("id, status, first_check_in, last_check_out, total_active_seconds, total_break_seconds, total_idle_seconds")
      .single();
    if (error && status === "LATE") {
      const retry = await supabase
        .from("attendance")
        .insert({ ...payload, status: "PRESENT" })
        .select("id, status, first_check_in, last_check_out, total_active_seconds, total_break_seconds, total_idle_seconds")
        .single();
      if (retry.error || !retry.data) throw new Error(retry.error?.message ?? error.message);
      return retry.data;
    }
    if (error || !created) throw new Error(error?.message ?? "Failed to mark attendance");
    return created;
  }

  await supabase
    .from("attendance")
    .update({
      status,
      first_check_in: row.first_check_in ?? now.toISOString(),
    })
    .eq("id", row.id);

  return row;
}

async function usedShiftBreakSeconds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  employeeId: string,
  shiftDate: string
) {
  const { start, end } = shiftAccountingWindowUtc(shiftDate);
  const { data } = await supabase
    .from("breaks")
    .select("break_type, started_at, ended_at, duration_seconds")
    .eq("employee_id", employeeId)
    .gte("started_at", start.toISOString())
    .lt("started_at", end.toISOString());
  return breakSecondsBySlot(data ?? []);
}

async function closeOpenMeeting(employeeId: string, at = new Date()) {
  const service = createServiceClient();
  const { data: meeting } = await service
    .from("meetings")
    .select("id, started_at")
    .eq("employee_id", employeeId)
    .is("ended_at", null)
    .maybeSingle();
  if (!meeting) return;
  const started = meeting.started_at ? new Date(meeting.started_at).getTime() : null;
  await service
    .from("meetings")
    .update({
      ended_at: at.toISOString(),
      duration_seconds: started ? Math.max(0, Math.floor((at.getTime() - started) / 1000)) : 0,
      status: started ? "ENDED" : "CANCELLED",
    })
    .eq("id", meeting.id);
}

async function closeOpenWashroom(employeeId: string, at = new Date()) {
  const service = createServiceClient();
  const { data: visit } = await service
    .from("washroom_visits")
    .select("id, started_at")
    .eq("employee_id", employeeId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!visit) return;
  const durationSeconds = Math.max(
    0,
    Math.floor((at.getTime() - new Date(visit.started_at).getTime()) / 1000)
  );
  await service
    .from("washroom_visits")
    .update({
      ended_at: at.toISOString(),
      duration_seconds: durationSeconds,
    })
    .eq("id", visit.id);
}

async function hasOpenWashroom(employeeId: string) {
  const { data } = await createServiceClient()
    .from("washroom_visits")
    .select("id")
    .eq("employee_id", employeeId)
    .is("ended_at", null)
    .maybeSingle();
  return !!data;
}

async function openMeetingRow(employeeId: string) {
  const { data } = await createServiceClient()
    .from("meetings")
    .select("id, started_at")
    .eq("employee_id", employeeId)
    .is("ended_at", null)
    .maybeSingle();
  return data;
}

export async function clockIn(): Promise<Result> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { error: "Not authenticated" };
  if (isSuperAdmin(ctx.roleKey)) {
    return { skipped: true };
  }
  const supabase = await createClient();
  const shiftDate = shiftDateIso();
  if (isWeekendIso(shiftDate)) {
    try {
      await ensureWeekendOff(supabase, ctx.employeeId, shiftDate);
    } catch {
      /* week off still applies in the attendance view */
    }
    return { skipped: true };
  }

  const existingAttendance = await attendanceForShift(supabase, ctx.employeeId, shiftDate);
  if (existingAttendance && BLOCKED_CLOCK_STATUSES.has(existingAttendance.status)) {
    return { activated: false, skipped: true };
  }

  const { data: existingActive } = await supabase
    .from("employee_sessions")
    .select("id")
    .eq("employee_id", ctx.employeeId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (existingActive) {
    try {
      await markPresent(supabase, ctx.employeeId, shiftDate);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Failed to update attendance" };
    }
    return { activated: false };
  }

  const { error: sessionError } = await supabase.from("employee_sessions").insert({
    employee_id: ctx.employeeId,
    status: "ACTIVE",
    app_last_seen_at: new Date().toISOString(),
  });
  if (sessionError) {
    if (sessionError.code === "23505") {
      try {
        await markPresent(supabase, ctx.employeeId, shiftDate);
      } catch {
        /* already clocked in */
      }
      return { activated: false };
    }
    return { error: sessionError.message };
  }

  try {
    await markPresent(supabase, ctx.employeeId, shiftDate);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update attendance" };
  }

  await createServiceClient()
    .from("notifications")
    .update({ data: { pending_signout: false } })
    .eq("employee_id", ctx.employeeId)
    .eq("type", ADMIN_LOGOUT_TYPE)
    .eq("data->>pending_signout", "true");

  try {
    void notifySuperAdmins({
      type: "EMPLOYEE_LOGIN",
      title: `${ctx.fullName} logged in`,
      body: `${ctx.fullName} (${ctx.employeeCode}) signed in and clocked in.`,
      excludeEmployeeId: ctx.employeeId,
    });
  } catch {
    /* login still succeeds if the alert cannot be sent */
  }

  revalidateLive();
  return { activated: true };
}

export async function clockOut(): Promise<Result> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { error: "Not authenticated" };
  if (isSuperAdmin(ctx.roleKey)) return { skipped: true };
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("employee_sessions")
    .select("id")
    .eq("employee_id", ctx.employeeId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (!session) return {};

  const { data: openBreak } = await supabase
    .from("breaks")
    .select("id")
    .eq("session_id", session.id)
    .is("ended_at", null)
    .maybeSingle();
  if (openBreak) return { error: "End your current break before clocking out." };
  if (await hasOpenWashroom(ctx.employeeId)) {
    return { error: "End washroom before clocking out." };
  }

  return closeWorkSession(ctx.employeeId, "ENDED");
}

/**
 * Stops today's timer and stores the elapsed working time. Login starts a new slice on the same day.
 * `endedAt` backdates the stop (last activity, or when break time ran out) so unattended time is not
 * counted as productive; `idleSeconds` is added to the day's idle total.
 */
export async function closeWorkSession(
  employeeId: string,
  status: "ENDED" | "TIMED_OUT" = "ENDED",
  options?: { revalidate?: boolean; endedAt?: Date; idleSeconds?: number }
): Promise<Result> {
  const supabase = createServiceClient();
  const { data: session } = await supabase
    .from("employee_sessions")
    .select("id, started_at")
    .eq("employee_id", employeeId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (!session) return {};

  const current = Date.now();
  const sessionStart = new Date(session.started_at).getTime();
  const now = new Date(
    Math.min(current, Math.max(sessionStart, options?.endedAt?.getTime() ?? current))
  );
  await closeOpenMeeting(employeeId, now);
  await closeOpenWashroom(employeeId, now);
  const { data: openBreak } = await supabase
    .from("breaks")
    .select("id, started_at, break_type")
    .eq("session_id", session.id)
    .is("ended_at", null)
    .maybeSingle();

  if (openBreak) {
    const durationSeconds = Math.max(
      0,
      Math.floor((now.getTime() - new Date(openBreak.started_at).getTime()) / 1000)
    );
    const shiftDate = shiftDateIso(new Date(openBreak.started_at));
    await supabase
      .from("breaks")
      .update({ ended_at: now.toISOString(), duration_seconds: durationSeconds })
      .eq("id", openBreak.id);
    try {
      const attendance = await ensureAttendanceRow(supabase as never, employeeId, shiftDate);
      if (!BLOCKED_CLOCK_STATUSES.has(attendance.status)) {
        await supabase
          .from("attendance")
          .update({
            total_break_seconds: (attendance.total_break_seconds ?? 0) + durationSeconds,
          })
          .eq("id", attendance.id);
      }
    } catch {
      /* still close the session so the working timer stops */
    }
  }

  const sessionSeconds = creditedWorkBounds(session.started_at, now).seconds;
  const [{ data: sessionBreaks }, { data: sessionWashroom }] = await Promise.all([
    supabase
      .from("breaks")
      .select("started_at, ended_at, duration_seconds")
      .eq("session_id", session.id),
    supabase
      .from("washroom_visits")
      .select("started_at, ended_at, duration_seconds")
      .eq("session_id", session.id),
  ]);
  const creditedSum = (rows: { started_at: string; ended_at: string | null; duration_seconds: number | null }[]) =>
    rows.reduce((sum, row) => sum + creditedAwaySeconds(session.started_at, row, now.getTime()), 0);
  const breakSeconds = creditedSum(sessionBreaks ?? []);
  const washroomSeconds = creditedSum(sessionWashroom ?? []);
  const activeSeconds = Math.max(0, sessionSeconds - breakSeconds - washroomSeconds);
  const shiftDate = shiftDateIso(new Date(session.started_at));

  const { error: sessionError } = await supabase
    .from("employee_sessions")
    .update({ ended_at: now.toISOString(), status })
    .eq("id", session.id);
  if (sessionError) return { error: sessionError.message };

  try {
    const attendance = await ensureAttendanceRow(supabase as never, employeeId, shiftDate);
    if (!BLOCKED_CLOCK_STATUSES.has(attendance.status)) {
      await supabase
        .from("attendance")
        .update({
          last_check_out: now.toISOString(),
          total_active_seconds: (attendance.total_active_seconds ?? 0) + activeSeconds,
          total_idle_seconds:
            (attendance.total_idle_seconds ?? 0) + Math.max(0, Math.floor(options?.idleSeconds ?? 0)),
        })
        .eq("id", attendance.id);
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update attendance" };
  }

  if (options?.revalidate !== false) revalidateLive();
  return {};
}

export async function startBreak(breakType: PolicyBreakType): Promise<Result> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { error: "Not authenticated" };
  if (isSuperAdmin(ctx.roleKey)) return { skipped: true };
  if (!BREAK_SLOTS.includes(breakType)) {
    return { error: "Choose Tea 1, Tea 2 or Lunch." };
  }

  const supabase = await createClient();

  const { data: session } = await supabase
    .from("employee_sessions")
    .select("id, started_at")
    .eq("employee_id", ctx.employeeId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (!session) return { error: "Clock in before starting a break." };

  const { data: openBreak } = await supabase
    .from("breaks")
    .select("id")
    .eq("session_id", session.id)
    .is("ended_at", null)
    .maybeSingle();

  if (openBreak) return { error: "You already have a break in progress." };

  const openMeeting = await openMeetingRow(ctx.employeeId);
  if (openMeeting?.started_at) return { error: "End your meeting before starting a break." };
  if (openMeeting) return { error: "Cancel or wait for the meeting request before starting a break." };
  if (await hasOpenWashroom(ctx.employeeId)) {
    return { error: "End washroom before starting a break." };
  }

  const shiftDate = shiftDateIso(new Date(session.started_at));
  const used = await usedShiftBreakSeconds(supabase, ctx.employeeId, shiftDate);
  if (used[breakType] >= slotBudgetSeconds(breakType)) {
    return { error: `${formatBreakType(breakType)} time is finished for this shift.` };
  }

  const { error } = await supabase.from("breaks").insert({
    employee_id: ctx.employeeId,
    session_id: session.id,
    break_type: breakType,
  });
  if (error) return { error: error.message };

  revalidateLive();
  return {};
}

export async function endBreak(): Promise<Result> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { error: "Not authenticated" };
  if (isSuperAdmin(ctx.roleKey)) return { skipped: true };
  const supabase = await createClient();

  const { data: openBreak } = await supabase
    .from("breaks")
    .select("id, started_at, session_id, break_type")
    .eq("employee_id", ctx.employeeId)
    .is("ended_at", null)
    .maybeSingle();

  if (!openBreak) return {};

  const now = new Date();
  const durationSeconds = Math.max(
    0,
    Math.floor((now.getTime() - new Date(openBreak.started_at).getTime()) / 1000)
  );
  const shiftDate = shiftDateIso(new Date(openBreak.started_at));

  const { error } = await supabase
    .from("breaks")
    .update({ ended_at: now.toISOString(), duration_seconds: durationSeconds })
    .eq("id", openBreak.id);
  if (error) return { error: error.message };

  try {
    const attendance = await ensureAttendanceRow(supabase, ctx.employeeId, shiftDate);
    if (!BLOCKED_CLOCK_STATUSES.has(attendance.status)) {
      await supabase
        .from("attendance")
        .update({
          total_break_seconds: (attendance.total_break_seconds ?? 0) + durationSeconds,
        })
        .eq("id", attendance.id);
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update attendance" };
  }

  revalidateLive();
  return {};
}

/** Employee asks to go to a meeting. The timer starts only after Super Admin accepts. */
export async function startMeeting(): Promise<Result> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { error: "Not authenticated" };
  if (isSuperAdmin(ctx.roleKey)) return { skipped: true };
  const service = createServiceClient();

  const { data: session } = await service
    .from("employee_sessions")
    .select("id")
    .eq("employee_id", ctx.employeeId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (!session) return { error: "Clock in before starting a meeting." };

  const { data: openBreak } = await service
    .from("breaks")
    .select("id")
    .eq("session_id", session.id)
    .is("ended_at", null)
    .maybeSingle();
  if (openBreak) return { error: "End your break before requesting a meeting." };
  if (await hasOpenWashroom(ctx.employeeId)) {
    return { error: "End washroom before requesting a meeting." };
  }

  const { data: openMeeting, error: lookupError } = await service
    .from("meetings")
    .select("id, started_at")
    .eq("employee_id", ctx.employeeId)
    .is("ended_at", null)
    .maybeSingle();
  if (lookupError) {
    return { error: "Meeting tracking is not set up yet. Run migration 0018_meetings.sql and 0019_washroom_and_meeting_approval.sql." };
  }
  if (openMeeting?.started_at) return { error: "You already have a meeting in progress." };
  if (openMeeting) return {};

  const { error } = await service.from("meetings").insert({
    employee_id: ctx.employeeId,
    session_id: session.id,
    started_at: null,
    status: "PENDING",
    requested_at: new Date().toISOString(),
  });
  if (error && error.code !== "23505") return { error: error.message };

  try {
    void notifySuperAdmins({
      type: "MEETING_REQUEST",
      title: `${ctx.fullName} requested a meeting`,
      body: `${ctx.fullName} (${ctx.employeeCode}) is waiting for you to accept. Meeting time starts after you accept.`,
      excludeEmployeeId: ctx.employeeId,
    });
  } catch {
    /* request still saved if the alert cannot be sent */
  }

  revalidateLive();
  return {};
}

export async function endMeeting(): Promise<Result> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { error: "Not authenticated" };
  if (isSuperAdmin(ctx.roleKey)) return { skipped: true };

  await closeOpenMeeting(ctx.employeeId);
  await createServiceClient()
    .from("employee_sessions")
    .update({ app_last_seen_at: new Date().toISOString() })
    .eq("employee_id", ctx.employeeId)
    .eq("status", "ACTIVE");

  revalidateLive();
  return {};
}

export async function acceptMeeting(meetingId: string): Promise<Result> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isSuperAdmin(ctx.roleKey)) return { error: "Not authorized" };
  const service = createServiceClient();
  const { data: meeting } = await service
    .from("meetings")
    .select("id, employee_id, started_at, ended_at")
    .eq("id", meetingId)
    .maybeSingle();
  if (!meeting || meeting.ended_at) return { error: "This meeting request is no longer open." };
  if (meeting.started_at) return {};

  const now = new Date().toISOString();
  const { error } = await service
    .from("meetings")
    .update({
      started_at: now,
      status: "ACTIVE",
      approved_by: ctx.employeeId,
      approved_at: now,
    })
    .eq("id", meeting.id);
  if (error) return { error: error.message };

  try {
    void insertAndEmitNotification({
      employeeId: meeting.employee_id,
      type: "MEETING_ACCEPTED",
      title: "Meeting accepted",
      body: "Admin accepted your meeting. The meeting timer has started.",
    });
  } catch {
    /* accept still succeeds */
  }

  revalidateLive();
  return {};
}

export async function rejectMeeting(meetingId: string): Promise<Result> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isSuperAdmin(ctx.roleKey)) return { error: "Not authorized" };
  const service = createServiceClient();
  const { data: meeting } = await service
    .from("meetings")
    .select("id, employee_id, started_at, ended_at")
    .eq("id", meetingId)
    .maybeSingle();
  if (!meeting || meeting.ended_at) return { error: "This meeting request is no longer open." };
  if (meeting.started_at) return { error: "This meeting already started. Ask the employee to end it." };

  const now = new Date().toISOString();
  const { error } = await service
    .from("meetings")
    .update({ ended_at: now, duration_seconds: 0, status: "REJECTED" })
    .eq("id", meeting.id);
  if (error) return { error: error.message };

  try {
    void insertAndEmitNotification({
      employeeId: meeting.employee_id,
      type: "MEETING_REJECTED",
      title: "Meeting not accepted",
      body: "Admin did not accept the meeting request. You are back on your shift.",
    });
  } catch {
    /* reject still succeeds */
  }

  revalidateLive();
  return {};
}

export async function startWashroom(): Promise<Result> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { error: "Not authenticated" };
  if (isSuperAdmin(ctx.roleKey)) return { skipped: true };
  const service = createServiceClient();

  const { data: session } = await service
    .from("employee_sessions")
    .select("id")
    .eq("employee_id", ctx.employeeId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (!session) return { error: "Clock in before going to washroom." };

  const { data: openBreak } = await service
    .from("breaks")
    .select("id")
    .eq("session_id", session.id)
    .is("ended_at", null)
    .maybeSingle();
  if (openBreak) return { error: "End your break before going to washroom." };

  const meeting = await openMeetingRow(ctx.employeeId);
  if (meeting?.started_at) return { error: "End your meeting before going to washroom." };
  if (meeting) return { error: "Cancel or wait for the meeting request first." };

  const { data: open, error: lookupError } = await service
    .from("washroom_visits")
    .select("id")
    .eq("employee_id", ctx.employeeId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lookupError) {
    return { error: "Washroom tracking is not set up yet. Run migration 0019_washroom_and_meeting_approval.sql." };
  }
  if (open) return {};

  const { error } = await service.from("washroom_visits").insert({
    employee_id: ctx.employeeId,
    session_id: session.id,
    started_at: new Date().toISOString(),
  });
  if (error && error.code !== "23505") return { error: error.message };

  revalidateLive();
  return {};
}

export async function endWashroom(): Promise<Result> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { error: "Not authenticated" };
  if (isSuperAdmin(ctx.roleKey)) return { skipped: true };
  await closeOpenWashroom(ctx.employeeId);
  revalidateLive();
  return {};
}

/** Super Admin stops an employee's timer and signs their open tab out (e.g. they left without logging out). */
export async function logoutEmployeeByAdmin(employeeId: string): Promise<Result> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isSuperAdmin(ctx.roleKey)) return { error: "Not authorized" };
  if (!z.string().uuid().safeParse(employeeId).success) return { error: "Invalid employee" };

  const { data: session } = await createServiceClient()
    .from("employee_sessions")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (!session) return { error: "This employee is not logged in." };

  const result = await closeWorkSession(employeeId, "ENDED");
  if (result.error) return result;

  try {
    await insertAndEmitNotification({
      employeeId,
      type: ADMIN_LOGOUT_TYPE,
      title: "Logged out by admin",
      body: `${ctx.fullName} ended your session. Sign in again to resume your timer.`,
      data: { pending_signout: true },
    });
  } catch {
    /* the timer is already stopped */
  }
  return {};
}

export async function endWorkSession(): Promise<Result> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { error: "Not authenticated" };
  if (isSuperAdmin(ctx.roleKey)) return { skipped: true };
  return closeWorkSession(ctx.employeeId, "ENDED");
}

const editSchema = z.object({
  employeeId: z.string().uuid(),
  attendanceDate: z.string().min(1),
  status: z.enum(ATTENDANCE_STATUSES),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  notes: z.string().optional(),
});

export async function upsertAttendanceByAdmin(
  _prev: { error?: string; success?: boolean },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isSuperAdmin(ctx.roleKey)) return { error: "Not authorized" };

  const parsed = editSchema.safeParse({
    employeeId: formData.get("employeeId"),
    attendanceDate: formData.get("attendanceDate"),
    status: formData.get("status"),
    checkIn: String(formData.get("checkIn") ?? ""),
    checkOut: String(formData.get("checkOut") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid attendance" };
  }

  const firstCheckIn = fromDatetimeLocalIst(parsed.data.checkIn ?? "");
  const lastCheckOut = fromDatetimeLocalIst(parsed.data.checkOut ?? "");
  if (firstCheckIn && lastCheckOut && lastCheckOut < firstCheckIn) {
    return { error: "Check-out must be after check-in." };
  }

  const supabase = await createClient();
  if (await isSuperAdminEmployee(supabase, parsed.data.employeeId)) {
    return { error: "Super Admin attendance is not recorded." };
  }
  const existing = await attendanceForShift(
    supabase,
    parsed.data.employeeId,
    parsed.data.attendanceDate
  );

  const payload = {
    employee_id: parsed.data.employeeId,
    attendance_date: parsed.data.attendanceDate,
    status: parsed.data.status,
    first_check_in: firstCheckIn,
    last_check_out: lastCheckOut,
    notes: parsed.data.notes?.trim() ? parsed.data.notes.trim() : null,
    source: existing ? ("CORRECTED" as const) : ("MANUAL" as const),
  };

  if (existing) {
    const { error } = await supabase.from("attendance").update(payload).eq("id", existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("attendance").insert(payload);
    if (error) return { error: error.message };
  }

  revalidateLive();
  return { success: true };
}
