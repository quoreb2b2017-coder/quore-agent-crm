import { after } from "next/server";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { createServiceClient } from "@/lib/supabase/service";
import { SUPER_ADMIN_ROLE } from "@/lib/permissions/roles";
import type { Json } from "@/types/supabase";
import { emitNotifications } from "./emit";

/** Super Admin ended this employee's session; `data.pending_signout` tells their open tab to sign out. */
export const ADMIN_LOGOUT_TYPE = "ADMIN_LOGOUT";

/** Someone did something in the app. The inbox reads the name and ID from the start of the body. */
export const STAFF_ACTION_TYPE = "STAFF_ACTION";

/** Wrong-password bursts and lockouts. */
export const SECURITY_ALERT_TYPE = "SECURITY_ALERT";

/**
 * Tells Super Admins what someone just did, never the person who did it.
 * Runs after the response so the button stays quick, and a failed alert cannot undo the action.
 * Never put amounts, bank details or private text in `action` or `detail`.
 */
export function notifyAdminsOfAction(
  actor: { employeeId: string; fullName: string; employeeCode: string },
  action: string,
  options?: { targetEmployeeId?: string; detail?: string; type?: string; skipIfSentWithinMs?: number }
) {
  after(async () => {
    try {
      if (options?.skipIfSentWithinMs) {
        const { data: recent } = await createServiceClient()
          .from("notifications")
          .select("id")
          .eq("type", options.type ?? STAFF_ACTION_TYPE)
          .eq("title", `${actor.fullName} ${action}`)
          .gte("created_at", new Date(Date.now() - options.skipIfSentWithinMs).toISOString())
          .limit(1);
        if (recent?.length) return;
      }
      let target: { full_name: string; employee_code: string } | null = null;
      if (options?.targetEmployeeId) {
        const { data } = await createServiceClient()
          .from("employees")
          .select("full_name, employee_code")
          .eq("id", options.targetEmployeeId)
          .maybeSingle();
        target = data;
      }
      await notifySuperAdmins({
        type: options?.type ?? STAFF_ACTION_TYPE,
        title: `${actor.fullName} ${action}${target ? ` ${target.full_name}` : ""}`,
        body:
          `${actor.fullName} (${actor.employeeCode}) ${action}` +
          `${target ? ` ${target.full_name} (${target.employee_code})` : ""}.` +
          `${options?.detail ? ` ${options.detail}` : ""}`,
        excludeEmployeeId: actor.employeeId,
      });
    } catch {
      /* the action is already saved */
    }
  });
}

export async function insertAndEmitNotification(input: {
  employeeId: string;
  title: string;
  body?: string | null;
  type: string;
  data?: Json;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .insert({
      employee_id: input.employeeId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      ...(input.data ? { data: input.data } : {}),
    })
    .select("id, employee_id, title, body, type, created_at")
    .single();

  if (error || !data) return;

  await emitNotifications([
    {
      id: data.id,
      employeeId: data.employee_id,
      title: data.title,
      body: data.body,
      type: data.type,
      createdAt: data.created_at,
    },
  ]);
}

export async function notifySuperAdmins(input: {
  title: string;
  body?: string | null;
  type: string;
  excludeEmployeeId?: string;
}) {
  const supabase = createServiceClient();
  const { data: role } = await supabase
    .from("roles")
    .select("id")
    .eq("role_key", SUPER_ADMIN_ROLE)
    .maybeSingle();
  if (!role) return;

  const { data: rows } = await supabase
    .from("employee_roles")
    .select("employee_id")
    .eq("role_id", role.id);
  const ids = Array.from(
    new Set(
      (rows ?? [])
        .map((row) => row.employee_id)
        .filter((id) => id !== input.excludeEmployeeId)
    )
  );
  if (ids.length === 0) return;

  const { data: inserted, error } = await supabase
    .from("notifications")
    .insert(
      ids.map((employee_id) => ({
        employee_id,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
      }))
    )
    .select("id, employee_id, title, body, type, created_at");

  if (error || !inserted?.length) return;

  await emitNotifications(
    inserted.map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      title: row.title,
      body: row.body,
      type: row.type,
      createdAt: row.created_at,
    }))
  );
}
