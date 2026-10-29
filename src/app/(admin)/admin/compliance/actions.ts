"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployeeContext, isSuperAdmin } from "@/lib/permissions/server";
import { createDataClient } from "@/lib/supabase/data";

export type RunChecksResult = {
  error?: string;
  results?: { control_code: string; result: string; exceptions_count: number }[];
};

/**
 * Runs the automated control checks now (they also run daily via pg_cron).
 * Results are stored as control_tests + AUTOMATED_TEST evidence awaiting review.
 */
export async function runAutomatedControlChecks(): Promise<RunChecksResult> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !(isSuperAdmin(ctx.roleKey) || ctx.permissions.includes("compliance.manage"))) {
    return { error: "You do not have permission to run control checks." };
  }

  const supabase = await createDataClient();
  const { data, error } = await supabase.rpc("run_automated_control_checks");
  if (error) return { error: error.message };

  revalidatePath("/admin/compliance");
  return { results: data ?? [] };
}
