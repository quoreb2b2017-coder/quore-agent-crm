"use server";

import { revalidatePath } from "next/cache";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { getCurrentEmployeeContext, isSuperAdmin } from "@/lib/permissions/server";

export async function resolvePolicyViolation(violationId: string) {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isSuperAdmin(ctx.roleKey)) return { error: "Not authorized" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("policy_violations")
    .update({ resolved: true, resolved_by: ctx.employeeId, resolved_at: new Date().toISOString() })
    .eq("id", violationId);

  revalidatePath("/admin/policy-violations");
  return { error: error?.message };
}
