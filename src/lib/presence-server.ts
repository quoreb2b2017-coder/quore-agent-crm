import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentEmployeeContext, isSuperAdmin } from "@/lib/permissions/server";
import { closeWorkSession } from "@/lib/actions/attendance";
import { shiftDateIso } from "@/lib/format";
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
  /** Break time remaining; the client restarts its countdown. */
  hold?: boolean;
  reason?: "break";
  /** When the timer stopped (epoch ms). */
  at?: number;
};

const SWEEP_EVERY_MS = 60_000;
let lastSweepAt = 0;

type OpenBreak = { id: string; employee_id: string; started_at: string; break_type: string };

/** When the open break's slot time runs out. */
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

/**
 * Heartbeat from an open CRM tab.
 * Keyboard / mouse idle no longer signs anyone out. Only a finished tea/lunch break does.
 */
export async function runPresenceHeartbeat(_input: {
  idleMs: number;
  hadSession: boolean;
}): Promise<PresenceResult> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || isSuperAdmin(ctx.roleKey)) return { expired: false };

  const service = createServiceClient();
  const now = Date.now();

  const { data: session } = await service
    .from("employee_sessions")
    .select("id")
    .eq("employee_id", ctx.employeeId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (!session) return { expired: false };

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
    const endsAt = await openBreakEndsAt(service, openBreak);
    if (endsAt.getTime() <= now) {
      await closeWorkSession(ctx.employeeId, "TIMED_OUT", { endedAt: endsAt });
      return { expired: true, reason: "break", at: endsAt.getTime() };
    }
    await markSeen();
    return { expired: false, active: true, hold: true };
  }

  await markSeen();
  return { expired: false, active: true };
}

/**
 * Closes sessions whose tea/lunch time has run out. Does not log anyone out for idle time.
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
    const endsAt = await openBreakEndsAt(service, openBreak);
    if (endsAt.getTime() <= now) {
      await closeWorkSession(openBreak.employee_id, "TIMED_OUT", { revalidate: false, endedAt: endsAt });
    }
  }
}
