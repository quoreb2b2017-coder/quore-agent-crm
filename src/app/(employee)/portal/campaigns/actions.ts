"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { getCurrentEmployeeContext, hasPermission } from "@/lib/permissions/server";

export type ActionState = { error?: string; success?: boolean };

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  startsOn: z.string().optional(),
  endsOn: z.string().optional(),
});

export async function createCampaign(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !hasPermission(ctx, "campaigns.create")) {
    return { error: "You do not have permission to create campaigns." };
  }

  const parsed = schema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    startsOn: formData.get("startsOn") || undefined,
    endsOn: formData.get("endsOn") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("campaigns").insert({
    name: parsed.data.name,
    description: parsed.data.description || null,
    starts_on: parsed.data.startsOn || null,
    ends_on: parsed.data.endsOn || null,
    owner_id: ctx.employeeId,
    status: "DRAFT",
  });

  if (error) return { error: error.message };

  revalidatePath("/portal/campaigns");
  return { success: true };
}
