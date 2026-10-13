import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import {
  DEFAULT_WORK_SETTINGS,
  lateIsInsideShift,
  setWorkSettings,
  type WorkSettings,
} from "@/lib/work-settings";

const CACHE_MS = 30_000;
let cache: { settings: WorkSettings; at: number } | null = null;

function mapRow(row: {
  time_zone: string;
  login_minutes: number;
  logout_minutes: number;
  late_minutes: number;
  annual_paid_leave_days: number;
}): WorkSettings {
  const timeZone = row.time_zone?.trim() || DEFAULT_WORK_SETTINGS.timeZone;
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    return DEFAULT_WORK_SETTINGS;
  }
  return {
    timeZone,
    loginMinutes: row.login_minutes,
    logoutMinutes: row.logout_minutes,
    lateMinutes: row.late_minutes,
    annualPaidLeaveDays: Number(row.annual_paid_leave_days),
  };
}

export function rememberWorkSettings(settings: WorkSettings) {
  setWorkSettings(settings);
  cache = { settings, at: Date.now() };
}

/** Loads the saved shift clock. Falls back to 6:30 PM–3:30 AM IST if the table is missing. */
export async function loadWorkSettings(): Promise<WorkSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    setWorkSettings(cache.settings);
    return cache.settings;
  }
  try {
    const { data, error } = await createServiceClient()
      .from("app_settings")
      .select("time_zone, login_minutes, logout_minutes, late_minutes, annual_paid_leave_days")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) {
      rememberWorkSettings(DEFAULT_WORK_SETTINGS);
      return DEFAULT_WORK_SETTINGS;
    }
    const settings = mapRow(data);
    rememberWorkSettings(settings);
    return settings;
  } catch {
    rememberWorkSettings(DEFAULT_WORK_SETTINGS);
    return DEFAULT_WORK_SETTINGS;
  }
}

export function validateWorkSettings(settings: WorkSettings): string | null {
  if (settings.loginMinutes === settings.logoutMinutes) {
    return "Login and logout time cannot be the same.";
  }
  if (!lateIsInsideShift(settings)) {
    return "Late time must be after login and before logout.";
  }
  if (!Number.isFinite(settings.annualPaidLeaveDays) || settings.annualPaidLeaveDays < 0) {
    return "Paid leave days must be zero or more.";
  }
  if (settings.annualPaidLeaveDays > 366) {
    return "Paid leave days cannot be more than 366.";
  }
  try {
    Intl.DateTimeFormat("en-US", { timeZone: settings.timeZone });
  } catch {
    return "Choose a valid time zone.";
  }
  return null;
}
