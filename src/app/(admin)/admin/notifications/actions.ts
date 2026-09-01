"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { getCurrentEmployeeContext, isSuperAdmin } from "@/lib/permissions/server";
import { emitNotifications } from "@/lib/realtime/emit";

export type ActionState = { error?: string; success?: boolean };

const schema = z.object({
  title: z.string().min(1, "Title is required"),
  body: z.string().optional(),
  recipient: z.string().min(1),
});

export async function sendNotification(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isSuperAdmin(ctx.roleKey)) {
    return { error: "Not authorized" };
  }

  const parsed = schema.safeParse({
    title: formData.get("title"),
    body: formData.get("body") || undefined,
    recipient: formData.get("recipient"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();

  let recipientIds: string[] = [];
  if (parsed.data.recipient === "ALL") {
    const { data } = await supabase
      .from("employees")
      .select("id")
      .eq("employment_status", "ACTIVE");
    recipientIds = (data ?? []).map((e) => e.id);
  } else {
    recipientIds = [parsed.data.recipient];
  }

  if (recipientIds.length === 0) {
    return { error: "No recipients found" };
  }

  const { data: inserted, error } = await supabase
    .from("notifications")
    .insert(
      recipientIds.map((employee_id) => ({
        employee_id,
        type: "ADMIN_ANNOUNCEMENT",
        title: parsed.data.title,
        body: parsed.data.body || null,
      }))
    )
    .select("id, employee_id, title, body, type, created_at");

  if (error) return { error: error.message };

  await emitNotifications(
    (inserted ?? []).map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      title: row.title,
      body: row.body,
      type: row.type,
      createdAt: row.created_at,
    }))
  );

  revalidatePath("/admin/notifications");
  revalidatePath("/portal/notifications");
  return { success: true };
}
