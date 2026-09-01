"use server";

import { revalidatePath } from "next/cache";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { getCurrentEmployeeContext, isSuperAdmin } from "@/lib/permissions/server";

export type TaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELLED";

export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { error: "Not authenticated" };

  const supabase = await createClient();
  let query = supabase.from("tasks").update({ status }).eq("id", taskId);
  if (!isSuperAdmin(ctx.roleKey)) {
    query = query.eq("assigned_to", ctx.employeeId);
  }
  const { error } = await query;

  revalidatePath("/admin/tasks");
  revalidatePath("/portal/tasks");

  return { error: error?.message };
}
