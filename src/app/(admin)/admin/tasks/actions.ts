"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { getCurrentEmployeeContext, isSuperAdmin } from "@/lib/permissions/server";
import { insertAndEmitNotification } from "@/lib/realtime/notify";

export type ActionState = { error?: string; success?: boolean };

const taskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  assignedTo: z.string().uuid("Select an assignee"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  dueDate: z.string().optional(),
});

export async function createTask(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isSuperAdmin(ctx.roleKey)) {
    return { error: "You do not have permission to create tasks." };
  }

  const parsed = taskSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    assignedTo: formData.get("assignedTo"),
    priority: formData.get("priority"),
    dueDate: formData.get("dueDate") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    title: parsed.data.title,
    description: parsed.data.description || null,
    assigned_to: parsed.data.assignedTo,
    assigned_by: ctx.employeeId,
    priority: parsed.data.priority,
    due_date: parsed.data.dueDate || null,
  });

  if (error) return { error: error.message };

  await insertAndEmitNotification({
    employeeId: parsed.data.assignedTo,
    type: "TASK_ASSIGNED",
    title: "New task assigned",
    body: parsed.data.title,
  });

  revalidatePath("/admin/tasks");
  return { success: true };
}
