"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { getCurrentEmployeeContext, hasPermission } from "@/lib/permissions/server";

export type ActionState = { error?: string; success?: boolean };

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  maxIdleMinutes: z.coerce.number().int().positive().optional().or(z.literal(NaN)),
});

export async function createWorkPolicy(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !hasPermission(ctx, "policies.manage")) {
    return { error: "You do not have permission to manage work policies." };
  }

  const parsed = schema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    maxIdleMinutes: formData.get("maxIdleMinutes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("work_policies").insert({
    name: parsed.data.name,
    description: parsed.data.description || null,
    rule_config: Number.isFinite(parsed.data.maxIdleMinutes)
      ? { max_idle_minutes: parsed.data.maxIdleMinutes }
      : {},
    created_by: ctx.employeeId,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/work-policies");
  return { success: true };
}
