"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { getCurrentEmployeeContext, hasPermission } from "@/lib/permissions/server";

export type ActionState = { error?: string; success?: boolean };

const schema = z.object({
  fullName: z.string().min(1, "Name is required"),
  email: z.email().optional().or(z.literal("")),
  phone: z.string().optional(),
  campaignId: z.string().uuid().optional().or(z.literal("")),
  source: z.string().optional(),
});

export async function createLead(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !hasPermission(ctx, "leads.manage")) {
    return { error: "You do not have permission to manage leads." };
  }

  const parsed = schema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email") || "",
    phone: formData.get("phone") || undefined,
    campaignId: formData.get("campaignId") || "",
    source: formData.get("source") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("leads").insert({
    full_name: parsed.data.fullName,
    email: parsed.data.email || null,
    phone: parsed.data.phone || null,
    campaign_id: parsed.data.campaignId || null,
    source: parsed.data.source || null,
    owner_id: ctx.employeeId,
    status: "NEW",
  });

  if (error) return { error: error.message };

  revalidatePath("/portal/leads");
  return { success: true };
}

type LeadStatus = "NEW" | "CONTACTED" | "QUALIFIED" | "CONVERTED" | "LOST";

export async function updateLeadStatus(leadId: string, status: LeadStatus) {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { error: "Not authenticated" };

  const supabase = await createClient();
  const { error } = await supabase.from("leads").update({ status }).eq("id", leadId);

  revalidatePath("/portal/leads");
  return { error: error?.message };
}
