import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentEmployeeContext, isSuperAdmin } from "@/lib/permissions/server";
import { clockIn, closeWorkSession } from "@/lib/actions/attendance";
import { shiftDateIso } from "@/lib/format";
import { IDLE_LOGOUT_MS } from "@/lib/live-time";
import {
  breakSecondsBySlot,
  breakSlot,
  openBreakLimitSeconds,
  shiftAccountingWindowUtc,
} from "@/lib/shift";

type ServiceClient = ReturnType<typeof createServiceClient>;

export type PresenceResult = {
  expired: boolean;
  /** The employee has a running timer. */
  active?: boolean;
  /** Idle rule paused (break or meeting); the client restarts its countdown. */
  hold?: boolean;
  /** A session closed while the employee was still active was reopened. */
  resumed?: boolean;
  reason?: "idle" | "break" | "timeout";
  /** When the timer stopped (epoch ms). */
  at?: number;
};

const SWEEP_EVERY_MS = 60_000;
let lastSweepAt = 0;

type OpenBreak = { id: string; employee_id: string; started_at: string; break_type: string };

/** When the open break's slot time runs out. Breaks pause the idle rule until then. */
async function openBreakEndsAt(service: ServiceClient, openBreak: OpenBreak): Promise<Date> {
  const { start, end } = shiftAccountingWindowUtc(shiftDateIso(new Date(openBreak.started_at)));
  const { data: rows } = await service
    .from("breaks")
    .select("id, break_type, started_at, ended_at, duration_seconds")
    .eq("employee_id", openBreak.employee_id)
    .gte("started_at", start.toISOString())
    .lt("started_at", end.toISOString());
  const closed = breakSecondsBySlot(rows ?? [], { closedOnly: true, excludeId: openBreak.id })[
    breakSlot(openBreak.break_type)
  ];
  const limit = openBreakLimitSeconds(openBreak.break_type, closed);
  return new Date(new Date(openBreak.started_at).getTime() + limit * 1000);
}

function closeForIdle(employeeId: string, lastActivityMs: number, options?: { revalidate?: boolean }) {
  return closeWorkSession(employeeId, "TIMED_OUT", {
    ...options,
    endedAt: new Date(lastActivityMs),
    idleSeconds: Math.min(Date.now() - lastActivityMs, IDLE_LOGOUT_MS) / 1000,
  });
}

/**
 * Heartbeat from an open CRM tab.
 * `idleMs` is the longest stretch without keyboard or mouse activity since the previous heartbeat.
 * `hadSession` is true when this tab has already seen a running timer.
 */
export async function runPresenceHeartbeat(input: {
  idleMs: number;
  hadSession: boolean;
}): Promise<PresenceResult> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || isSuperAdmin(ctx.roleKey)) return { expired: false };

  const service = createServiceClient();
  const now = Date.now();
  const reportedIdle = Number.isFinite(input.idleMs) ? Math.max(0, input.idleMs) : 0;

  const { data: session } = await service
    .from("employee_sessions")
    .select("id, started_at")
    .eq("employee_id", ctx.employeeId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (!session) {
    if (!input.hadSession) return { expired: false };
    const { data: latest } = await service
      .from("employee_sessions")
      .select("status, ended_at")
      .eq("employee_id", ctx.employeeId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest?.status !== "TIMED_OUT") return { expired: false };
    // Closed while heartbeats could not reach the server, but the employee kept working.
    if (reportedIdle < IDLE_LOGOUT_MS) {
      const reopened = await clockIn();
      return reopened.activated
        ? { expired: false, active: true, resumed: true }
        : { expired: false };
    }
    return {
      expired: true,
      reason: "timeout",
      at: latest.ended_at ? new Date(latest.ended_at).getTime() : now,
    };
  }

  const markSeen = (at: number) =>
    service
      .from("employee_sessions")
      .update({ app_last_seen_at: new Date(at).toISOString() })
      .eq("id", session.id);

  const [{ data: openMeeting }, { data: openBreak }] = await Promise.all([
    service
      .from("meetings")
      .select("id")
      .eq("employee_id", ctx.employeeId)
      .is("ended_at", null)
      .maybeSingle(),
    service
      .from("breaks")
      .select("id, employee_id, started_at, break_type")
      .eq("session_id", session.id)
      .is("ended_at", null)
      .maybeSingle(),
  ]);

  if (openMeeting) {
    await markSeen(now);
    return { expired: false, active: true, hold: true };
  }

  if (openBreak) {
    const endsAt = await openBreakEndsAt(service, openBreak);
    if (endsAt.getTime() <= now) {
      await closeWorkSession(ctx.employeeId, "TIMED_OUT", { endedAt: endsAt });
      return { expired: true, reason: "break", at: endsAt.getTime() };
    }
    await markSeen(now);
    return { expired: false, active: true, hold: true };
  }

  // The idle countdown restarts at clock-in and when a break or meeting ends.
  const [{ data: lastBreak }, { data: lastMeeting }] = await Promise.all([
    service
      .from("breaks")
      .select("ended_at")
      .eq("session_id", session.id)
      .not("ended_at", "is", null)
      .order("ended_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    service
      .from("meetings")
      .select("ended_at")
      .eq("employee_id", ctx.employeeId)
      .not("ended_at", "is", null)
      .order("ended_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const restartedAt = Math.max(
    new Date(session.started_at).getTime(),
    lastBreak?.ended_at ? new Date(lastBreak.ended_at).getTime() : 0,
    lastMeeting?.ended_at ? new Date(lastMeeting.ended_at).getTime() : 0
  );
  const idle = Math.min(reportedIdle, Math.max(0, now - restartedAt));
  const lastActivity = now - idle;

  if (idle >= IDLE_LOGOUT_MS) {
    await closeForIdle(ctx.employeeId, lastActivity);
    return { expired: true, reason: "idle", at: lastActivity };
  }

  await markSeen(lastActivity);
  return { expired: false, active: true };
}

/**
 * Closes sessions whose CRM tab stopped reporting (tab closed, laptop asleep, offline).
 * Runs at most once a minute per server instance.
 */
export async function sweepIdleSessions(options?: { force?: boolean }) {
  const now = Date.now();
  if (!options?.force && now - lastSweepAt < SWEEP_EVERY_MS) return;
  lastSweepAt = now;

  const service = createServiceClient();
  const [{ data: sessions }, { data: openMeetings }, { data: openBreaks }] = await Promise.all([
    service
      .from("employee_sessions")
      .select("employee_id, started_at, app_last_seen_at")
      .eq("status", "ACTIVE"),
    service.from("meetings").select("employee_id").is("ended_at", null),
    service
      .from("breaks")
      .select("id, employee_id, started_at, break_type")
      .is("ended_at", null),
  ]);
  const inMeeting = new Set((openMeetings ?? []).map((row) => row.employee_id));
  const breakByEmployee = new Map((openBreaks ?? []).map((row) => [row.employee_id, row]));

  for (const session of sessions ?? []) {
    if (inMeeting.has(session.employee_id)) continue;
    const openBreak = breakByEmployee.get(session.employee_id);
    if (openBreak) {
      const endsAt = await openBreakEndsAt(service, openBreak);
      if (endsAt.getTime() <= now) {
        await closeWorkSession(session.employee_id, "TIMED_OUT", { revalidate: false, endedAt: endsAt });
      }
      continue;
    }
    const seen = new Date(session.app_last_seen_at ?? session.started_at).getTime();
    if (now - seen >= IDLE_LOGOUT_MS) {
      await closeForIdle(session.employee_id, seen, { revalidate: false });
    }
  }
}
