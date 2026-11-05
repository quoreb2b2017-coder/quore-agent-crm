import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentEmployeeContext, isManagement } from "@/lib/permissions/server";
import { closeWorkSession } from "@/lib/actions/attendance";
import { shiftDateIso } from "@/lib/format";
import { softOvertimeMinutes, shiftWindowUtc } from "@/lib/shift";
import { ensureGoogleTime, googleDate } from "@/lib/google-time";
import { ADMIN_LOGOUT_TYPE, notifySuperAdmins, STAFF_ACTION_TYPE } from "@/lib/realtime/notify";
import { loadEffectiveWorkSettings } from "@/lib/work-settings-server";
import type { WorkSettings } from "@/lib/work-settings";

export type PresenceResult = {
  expired: boolean;
  /** The employee has a running timer. */
  active?: boolean;
  /** Break time remaining; the client restarts its countdown. */
  hold?: boolean;
  reason?: "break" | "admin";
  /** When the timer stopped (epoch ms). */
  at?: number;
};

const SWEEP_EVERY_MS = 60_000;
let lastSweepAt = 0;

type OpenBreak = { started_at: string };

/** A break may run over its slot (counted as excess); it is closed at shift end (+ overtime). */
function openBreakEndsAt(
  openBreak: OpenBreak,
  settings: WorkSettings,
  overtimeMinutes = 0
): Date {
  return shiftWindowUtc(shiftDateIso(new Date(openBreak.started_at)), settings, overtimeMinutes).end;
}

async function overtimeForBreak(employeeId: string, startedAt: string) {
  const service = createServiceClient();
  const shiftDate = shiftDateIso(new Date(startedAt));
  const { data } = await service
    .from("attendance")
    .select("overtime_minutes")
    .eq("employee_id", employeeId)
    .eq("attendance_date", shiftDate)
    .maybeSingle();
  return softOvertimeMinutes(data?.overtime_minutes ?? 0);
}

/**
 * Heartbeat from an open CRM tab.
 * Keyboard / mouse idle does not sign anyone out; a break still open at shift end does.
 */
export async function runPresenceHeartbeat(_input: {
  idleMs: number;
  hadSession: boolean;
}): Promise<PresenceResult> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || isManagement(ctx.roleKey)) return { expired: false };

  await ensureGoogleTime();
  const settings = await loadEffectiveWorkSettings(ctx.employeeId);
  const service = createServiceClient();
  const now = googleDate().getTime();

  const { data: session } = await service
    .from("employee_sessions")
    .select("id")
    .eq("employee_id", ctx.employeeId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (!session) {
    const { data: forced } = await service
      .from("notifications")
      .select("id, created_at")
      .eq("employee_id", ctx.employeeId)
      .eq("type", ADMIN_LOGOUT_TYPE)
      .eq("data->>pending_signout", "true")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!forced) return { expired: false };
    await service
      .from("notifications")
      .update({ data: { pending_signout: false } })
      .eq("employee_id", ctx.employeeId)
      .eq("type", ADMIN_LOGOUT_TYPE)
      .eq("data->>pending_signout", "true");
    return { expired: true, reason: "admin", at: new Date(forced.created_at).getTime() };
  }

  const markSeen = () =>
    service
      .from("employee_sessions")
      .update({ app_last_seen_at: new Date(now).toISOString() })
      .eq("id", session.id);

  const { data: openBreak } = await service
    .from("breaks")
    .select("id, employee_id, started_at, break_type")
    .eq("session_id", session.id)
    .is("ended_at", null)
    .maybeSingle();

  if (openBreak) {
    const overtimeMinutes = await overtimeForBreak(ctx.employeeId, openBreak.started_at);
    const endsAt = openBreakEndsAt(openBreak, settings, overtimeMinutes);
    if (endsAt.getTime() <= now) {
      const closed = await closeWorkSession(ctx.employeeId, "TIMED_OUT", { endedAt: endsAt });
      if (closed.closed) await notifyAutoLogout(ctx.employeeId);
      return { expired: true, reason: "break", at: endsAt.getTime() };
    }
    await markSeen();
    return { expired: false, active: true, hold: true };
  }

  await markSeen();
  return { expired: false, active: true };
}

/** Nobody clicked anything here, so this sends directly: it can run outside a request. */
async function notifyAutoLogout(employeeId: string) {
  try {
    const { data: employee } = await createServiceClient()
      .from("employees")
      .select("full_name, employee_code")
      .eq("id", employeeId)
      .maybeSingle();
    if (!employee) return;
    await notifySuperAdmins({
      type: STAFF_ACTION_TYPE,
      title: `${employee.full_name} was logged out automatically`,
      body: `${employee.full_name} (${employee.employee_code}) was logged out automatically. Their break was still open when the time ended.`,
    });
  } catch {
    /* the session is already closed */
  }
}

/**
 * Closes sessions whose break is still open at shift end. Does not log anyone out for idle time.
 */
export async function sweepIdleSessions(options?: { force?: boolean }) {
  const now = Date.now();
  if (!options?.force && now - lastSweepAt < SWEEP_EVERY_MS) return;
  lastSweepAt = now;

  const service = createServiceClient();
  const { data: openBreaks } = await service
    .from("breaks")
    .select("id, employee_id, started_at, break_type")
    .is("ended_at", null);

  for (const openBreak of openBreaks ?? []) {
    const settings = await loadEffectiveWorkSettings(openBreak.employee_id);
    const overtimeMinutes = await overtimeForBreak(openBreak.employee_id, openBreak.started_at);
    const endsAt = openBreakEndsAt(openBreak, settings, overtimeMinutes);
    if (endsAt.getTime() <= now) {
      const closed = await closeWorkSession(openBreak.employee_id, "TIMED_OUT", { revalidate: false, endedAt: endsAt });
      if (closed.closed) await notifyAutoLogout(openBreak.employee_id);
    }
  }
}
