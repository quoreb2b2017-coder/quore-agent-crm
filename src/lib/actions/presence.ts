"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentEmployeeContext, isSuperAdmin } from "@/lib/permissions/server";
import { closeWorkSession } from "@/lib/actions/attendance";
import { IDLE_LOGOUT_MS } from "@/lib/live-time";

export async function touchPresence() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || isSuperAdmin(ctx.roleKey)) return;
  const service = createServiceClient();
  await service
    .from("employee_sessions")
    .update({ app_last_seen_at: new Date().toISOString() })
    .eq("employee_id", ctx.employeeId)
    .eq("status", "ACTIVE");
  await sweepIdleSessions(ctx.employeeId);
}

export async function expireIfIdle() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { expired: true };
  if (isSuperAdmin(ctx.roleKey)) return { expired: true };

  const service = createServiceClient();
  const { data: session } = await service
    .from("employee_sessions")
    .select("started_at, app_last_seen_at")
    .eq("employee_id", ctx.employeeId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (!session) return { expired: true };
  const seen = new Date(session.app_last_seen_at ?? session.started_at).getTime();
  if (Date.now() - seen < IDLE_LOGOUT_MS) return { expired: false };

  await closeWorkSession(ctx.employeeId, "TIMED_OUT");
  return { expired: true };
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

  for (const session of sessions ?? []) {
    if (session.employee_id === exceptEmployeeId) continue;
    const seen = new Date(session.app_last_seen_at ?? session.started_at).getTime();
    if (seen <= cutoff) {
      await closeWorkSession(session.employee_id, "TIMED_OUT", options);
    }
  }
}
