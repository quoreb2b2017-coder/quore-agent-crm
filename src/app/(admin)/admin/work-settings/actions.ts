"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployeeContext, isSuperAdmin } from "@/lib/permissions/server";
import {
  loadWorkSettings,
  rememberWorkSettings,
  validateWorkSettings,
} from "@/lib/work-settings-server";
import { createServiceClient } from "@/lib/supabase/service";
import { timeValueToMinutes, type WorkSettings } from "@/lib/work-settings";

export async function saveWorkSettings(
  _prev: { error?: string; success?: boolean },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isSuperAdmin(ctx.roleKey)) return { error: "Not authorized" };

  const login = timeValueToMinutes(String(formData.get("login") ?? ""));
  const logout = timeValueToMinutes(String(formData.get("logout") ?? ""));
  const annual = Number(formData.get("annualPaidLeaveDays"));
  const timeZone = String(formData.get("timeZone") ?? "").trim();
  if (login == null || logout == null) {
    return { error: "Enter login and logout time." };
  }

  const settings: WorkSettings = {
    timeZone,
    loginMinutes: login,
    logoutMinutes: logout,
    lateMinutes: (login + 1) % (24 * 60),
    annualPaidLeaveDays: annual,
  };
  const invalid = validateWorkSettings(settings);
  if (invalid) return { error: invalid };

  const { error } = await createServiceClient()
    .from("app_settings")
    .upsert({
      id: 1,
      time_zone: settings.timeZone,
      login_minutes: settings.loginMinutes,
      logout_minutes: settings.logoutMinutes,
      late_minutes: settings.lateMinutes,
      annual_paid_leave_days: settings.annualPaidLeaveDays,
      updated_at: new Date().toISOString(),
    });
  if (error) {
    if (error.message.includes("app_settings")) {
      return {
        error: "Work settings are not set up yet. Run supabase/migrations/0021_work_settings.sql in the Supabase SQL Editor.",
      };
    }
    return { error: error.message };
  }

  rememberWorkSettings(settings);
  await loadWorkSettings();
  revalidatePath("/", "layout");
  return { success: true };
}
