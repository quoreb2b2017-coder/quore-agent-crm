"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { getCurrentEmployeeContext, hasPermission } from "@/lib/permissions/server";

const departmentSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

export type ActionState = { error?: string; success?: boolean };

async function assertCanManage() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !hasPermission(ctx, "employees.manage")) {
    throw new Error("You do not have permission to manage departments.");
  }
}

export async function createDepartment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await assertCanManage();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not authorized" };
  }

  const parsed = departmentSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("departments").insert({
    name: parsed.data.name,
    description: parsed.data.description || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/departments");
  return { success: true };
}
