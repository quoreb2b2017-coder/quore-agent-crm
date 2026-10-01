"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentEmployeeContext, isSuperAdmin } from "@/lib/permissions/server";
import { closeWorkSession } from "@/lib/actions/attendance";
import { shiftDateIso } from "@/lib/format";
import { IDLE_LOGOUT_MS } from "@/lib/live-time";
import {
  breakDurationSeconds,
  isLunchBreak,
  openBreakLimitSeconds,
  shiftAccountingWindowUtc,
} from "@/lib/shift";

type ServiceClient = ReturnType<typeof createServiceClient>;

/** Active breaks stay signed in. Once tea or lunch time is used up, logout is allowed. */
async function breakLogoutState(service: ServiceClient, employeeId: string) {
  const { data: openBreak } = await service
    .from("breaks")
    .select("id, started_at, break_type")
    .eq("employee_id", employeeId)
    .is("ended_at", null)
    .maybeSingle();
  if (!openBreak) return "none" as const;

  const shiftDate = shiftDateIso(new Date(openBreak.started_at));
  const { start, end } = shiftAccountingWindowUtc(shiftDate);
  const { data: rows } = await service
    .from("breaks")
    .select("id, break_type, started_at, ended_at, duration_seconds")
    .eq("employee_id", employeeId)
    .gte("started_at", start.toISOString())
    .lt("started_at", end.toISOString());

  const lunch = isLunchBreak(openBreak.break_type);
  let closed = 0;
  for (const row of rows ?? []) {
    if (row.id === openBreak.id || row.ended_at == null) continue;
    if (isLunchBreak(row.break_type) !== lunch) continue;
    closed += breakDurationSeconds(row);
  }

  const limit = openBreakLimitSeconds(openBreak.break_type, closed);
  const elapsed = breakDurationSeconds({ started_at: openBreak.started_at, ended_at: null });
  return elapsed >= limit ? ("finished" as const) : ("active" as const);
}

/** `hold` means the idle timer is paused (break or meeting); the client restarts its countdown. */
export async function syncPresence(idle: boolean): Promise<{ expired: boolean; hold?: boolean }> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { expired: false };
  if (isSuperAdmin(ctx.roleKey)) return { expired: false };

  const service = createServiceClient();
  const { data: session } = await service
    .from("employee_sessions")
    .select("id")
    .eq("employee_id", ctx.employeeId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  // No running timer (not clocked in yet, on leave, week off): nothing to time out.
  if (!session) return { expired: false };

  const touch = () =>
    service
      .from("employee_sessions")
      .update({ app_last_seen_at: new Date().toISOString() })
      .eq("id", session.id);

  // In a meeting there is no typing, but the time is productive: never idle out.
  const { data: openMeeting } = await service
    .from("meetings")
    .select("id")
    .eq("employee_id", ctx.employeeId)
    .is("ended_at", null)
    .maybeSingle();
  if (openMeeting) {
    await touch();
    return { expired: false, hold: true };
  }

  const breakState = await breakLogoutState(service, ctx.employeeId);
  if (breakState === "finished") {
    await closeWorkSession(ctx.employeeId, "TIMED_OUT");
    return { expired: true };
  }
  if (breakState === "active") {
    await touch();
    return { expired: false, hold: true };
  }
  if (idle) {
    await closeWorkSession(ctx.employeeId, "TIMED_OUT");
    return { expired: true };
  }

  await touch();
  await sweepIdleSessions(ctx.employeeId);
  return { expired: false };
}

export async function sweepIdleSessions(
  exceptEmployeeId?: string,
  options?: { revalidate?: boolean }
) {
  const service = createServiceClient();
  const cutoff = Date.now() - IDLE_LOGOUT_MS;
  const { data: sessions } = await service
    .from("employee_sessions")
    .select("employee_id, started_at, app_last_seen_at")
    .eq("status", "ACTIVE");
  const { data: openMeetings } = await service
    .from("meetings")
    .select("employee_id")
    .is("ended_at", null);
  const inMeeting = new Set((openMeetings ?? []).map((row) => row.employee_id));

  for (const session of sessions ?? []) {
    if (session.employee_id === exceptEmployeeId) continue;
    if (inMeeting.has(session.employee_id)) continue;
    const breakState = await breakLogoutState(service, session.employee_id);
    if (breakState === "active") continue;
    if (breakState === "finished") {
      await closeWorkSession(session.employee_id, "TIMED_OUT", options);
      continue;
    }
    const seen = new Date(session.app_last_seen_at ?? session.started_at).getTime();
    if (seen <= cutoff) {
      await closeWorkSession(session.employee_id, "TIMED_OUT", options);
    }
  }
}
