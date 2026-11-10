"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { isSuperAdmin } from "@/lib/permissions/roles";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { createServiceClient } from "@/lib/supabase/service";
import { notifyAdminsOfAction } from "@/lib/realtime/notify";

export type ProfileActionState = { error?: string; success?: boolean };

const schema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(120),
  phone: z
    .string()
    .trim()
    .refine((value) => /^[+\d][\d\s-]{6,18}$/.test(value), "Enter a valid phone number"),
  workLocation: z
    .string()
    .trim()
    .max(120)
    .transform((value) => value || null),
});

/**
 * Super Admin edits their own name, phone and work location. Nobody manages a Super Admin
 * from the Employees page, so this is the only place. Every change is in the audit log.
 * The sign-in email is left out on purpose: a typo there would lock the account out.
 */
export async function updateOwnProfile(_prev: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { error: "Not authenticated" };
  if (!isSuperAdmin(ctx.roleKey)) return { error: "Ask Super Admin to change your profile." };

  const parsed = schema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    workLocation: String(formData.get("workLocation") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details" };

  const supabase = await createClient();
  const { data: me } = await supabase.from("employees").select("auth_user_id").eq("id", ctx.employeeId).maybeSingle();
  const { error } = await supabase
    .from("employees")
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone,
      work_location: parsed.data.workLocation,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ctx.employeeId);
  if (error) return { error: error.message };

  if (me?.auth_user_id) {
    await createServiceClient()
      .auth.admin.updateUserById(me.auth_user_id, { user_metadata: { full_name: parsed.data.fullName } })
      .catch(() => undefined);
  }

  notifyAdminsOfAction(ctx, "updated their own profile");
  revalidatePath("/", "layout");
  return { success: true };
}
