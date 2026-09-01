import { createDataClient as createClient } from "@/lib/supabase/data";
import { SUPER_ADMIN_ROLE } from "@/lib/permissions/roles";
import { emitNotifications } from "./emit";

export async function insertAndEmitNotification(input: {
  employeeId: string;
  title: string;
  body?: string | null;
  type: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .insert({
      employee_id: input.employeeId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
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
  const supabase = await createClient();
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
