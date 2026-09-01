"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { getCurrentEmployeeContext, isSuperAdmin } from "@/lib/permissions/server";
import { isSuperAdminEmployee } from "@/lib/queries/admin-dashboard";
import { isWeekendIso, shiftDateIso } from "@/lib/format";
import { ensureWeekendOff } from "@/lib/attendance-weekend";
import {
  breakDurationSeconds,
  fromDatetimeLocalIst,
  isLunchBreak,
  LUNCH_BREAK_BUDGET_SECONDS,
  TEA_BREAK_BUDGET_SECONDS,
  shiftAccountingWindowUtc,
  type PolicyBreakType,
} from "@/lib/shift";
import { notifySuperAdmins } from "@/lib/realtime/notify";

type Result = { error?: string; activated?: boolean; skipped?: boolean };

const ATTENDANCE_STATUSES = [
  "PRESENT",
  "ABSENT",
  "HALF_DAY",
  "ON_LEAVE",
  "HOLIDAY",
  "WEEK_OFF",
] as const;

function revalidateLive() {
  revalidatePath("/portal/dashboard");
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
    .select("id, status, first_check_in, last_check_out, total_active_seconds, total_break_seconds")
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
    .select("id, status, first_check_in, last_check_out, total_active_seconds, total_break_seconds")
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

  if (!row) {
    const { data: created, error } = await supabase
      .from("attendance")
      .insert({
        employee_id: employeeId,
        attendance_date: shiftDate,
        status: "PRESENT",
        first_check_in: new Date().toISOString(),
      })
      .select("id, status, first_check_in, last_check_out, total_active_seconds, total_break_seconds")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Failed to mark attendance");
    return created;
  }

  await supabase
    .from("attendance")
    .update({
      status: "PRESENT",
      first_check_in: row.first_check_in ?? new Date().toISOString(),
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

  let tea = 0;
  let lunch = 0;
  for (const row of data ?? []) {
    const seconds = breakDurationSeconds(row);
    if (isLunchBreak(row.break_type)) lunch += seconds;
    else tea += seconds;
  }
  return { tea, lunch };
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
    .select("id, started_at")
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

  const now = new Date();
  const sessionSeconds = Math.max(
    0,
    Math.floor((now.getTime() - new Date(session.started_at).getTime()) / 1000)
  );

  const { data: sessionBreaks } = await supabase
    .from("breaks")
    .select("duration_seconds")
    .eq("session_id", session.id);

  const breakSeconds = (sessionBreaks ?? []).reduce((sum, b) => sum + (b.duration_seconds ?? 0), 0);
  const activeSeconds = Math.max(0, sessionSeconds - breakSeconds);
  const shiftDate = shiftDateIso(new Date(session.started_at));

  const { error: sessionError } = await supabase
    .from("employee_sessions")
    .update({ ended_at: now.toISOString(), status: "ENDED" })
    .eq("id", session.id);
  if (sessionError) return { error: sessionError.message };

  try {
    const attendance = await ensureAttendanceRow(supabase, ctx.employeeId, shiftDate);
    if (!BLOCKED_CLOCK_STATUSES.has(attendance.status)) {
      await supabase
        .from("attendance")
        .update({
          last_check_out: now.toISOString(),
          total_active_seconds: (attendance.total_active_seconds ?? 0) + activeSeconds,
        })
        .eq("id", attendance.id);
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update attendance" };
  }

  revalidateLive();
  return {};
}

export async function startBreak(breakType: PolicyBreakType = "TEA"): Promise<Result> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { error: "Not authenticated" };
  if (isSuperAdmin(ctx.roleKey)) return { skipped: true };
  if (breakType !== "TEA" && breakType !== "LUNCH") {
    return { error: "Choose Tea or Lunch." };
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

  const shiftDate = shiftDateIso(new Date(session.started_at));
  const used = await usedShiftBreakSeconds(supabase, ctx.employeeId, shiftDate);
  if (breakType === "TEA" && used.tea >= TEA_BREAK_BUDGET_SECONDS) {
    return { error: "Tea time is finished for this shift." };
  }
  if (breakType === "LUNCH" && used.lunch >= LUNCH_BREAK_BUDGET_SECONDS) {
    return { error: "Lunch time is finished for this shift." };
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
  let durationSeconds = Math.max(
    0,
    Math.floor((now.getTime() - new Date(openBreak.started_at).getTime()) / 1000)
  );

  const shiftDate = shiftDateIso(new Date(openBreak.started_at));
  const { start, end } = shiftAccountingWindowUtc(shiftDate);
  const { data: shiftBreaks } = await supabase
    .from("breaks")
    .select("id, break_type, started_at, ended_at, duration_seconds")
    .eq("employee_id", ctx.employeeId)
    .gte("started_at", start.toISOString())
    .lt("started_at", end.toISOString());

  let closedTea = 0;
  let closedLunch = 0;
  for (const row of shiftBreaks ?? []) {
    if (row.id === openBreak.id || row.ended_at == null) continue;
    const seconds = breakDurationSeconds(row);
    if (isLunchBreak(row.break_type)) closedLunch += seconds;
    else closedTea += seconds;
  }

  const budget = isLunchBreak(openBreak.break_type)
    ? LUNCH_BREAK_BUDGET_SECONDS
    : TEA_BREAK_BUDGET_SECONDS;
  const closedUsed = isLunchBreak(openBreak.break_type) ? closedLunch : closedTea;
  durationSeconds = Math.min(durationSeconds, Math.max(0, budget - closedUsed));

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

export async function endWorkSession(): Promise<Result> {
  const breakResult = await endBreak();
  if (breakResult.error) return breakResult;
  return clockOut();
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
