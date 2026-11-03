import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthUser } from "@/lib/supabase/server";
import {
  DEFAULT_WORK_SETTINGS,
  applyWorkSchedule,
  getWorkSettings,
  lateIsInsideShift,
  parseWorkSchedule,
  setWorkSettings,
  type WorkSchedule,
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

export function validateWorkSchedule(schedule: WorkSchedule): string | null {
  if (schedule.loginMinutes === schedule.logoutMinutes) {
    return "Login and logout time cannot be the same.";
  }
  return null;
}

/** Per-employee login/logout override, or null when they use the company shift. */
export async function loadEmployeeWorkSchedule(employeeId: string): Promise<WorkSchedule | null> {
  try {
    const { data, error } = await createServiceClient()
      .from("employees")
      .select("work_schedule")
      .eq("id", employeeId)
      .maybeSingle();
    if (error || !data) return null;
    return parseWorkSchedule(data.work_schedule);
  } catch {
    return null;
  }
}

/** Company shift with this employee's login/logout override applied. */
export async function loadEffectiveWorkSettings(employeeId?: string | null): Promise<WorkSettings> {
  const company = await loadWorkSettings();
  if (!employeeId) return company;
  const schedule = await loadEmployeeWorkSchedule(employeeId);
  const settings = applyWorkSchedule(company, schedule);
  setWorkSettings(settings);
  return settings;
}

/** Batch map of employeeId → effective WorkSettings (for graphs / team reports). */
export async function loadEmployeeWorkSettingsMap(
  employeeIds: string[]
): Promise<Map<string, WorkSettings>> {
  const company = await loadWorkSettings();
  const map = new Map<string, WorkSettings>();
  if (employeeIds.length === 0) return map;
  const { data } = await createServiceClient()
    .from("employees")
    .select("id, work_schedule")
    .in("id", employeeIds);
  const byId = new Map((data ?? []).map((row) => [row.id, row.work_schedule]));
  for (const id of employeeIds) {
    map.set(id, applyWorkSchedule(company, parseWorkSchedule(byId.get(id))));
  }
  return map;
}

/** Signed-in employee's effective shift (company + their override). */
export async function loadEffectiveWorkSettingsForCurrentUser(): Promise<WorkSettings> {
  const company = await loadWorkSettings();
  try {
    const user = await getAuthUser();
    if (!user) return company;
    const { data } = await createServiceClient()
      .from("employees")
      .select("work_schedule")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    const settings = applyWorkSchedule(company, parseWorkSchedule(data?.work_schedule));
    setWorkSettings(settings);
    return settings;
  } catch {
    return company;
  }
}

/** Temporarily apply one employee's shift for a server calculation, then restore. */
export async function withEmployeeWorkSettings<T>(
  employeeId: string,
  fn: (settings: WorkSettings) => T | Promise<T>
): Promise<T> {
  const previous = { ...getWorkSettings() };
  const settings = await loadEffectiveWorkSettings(employeeId);
  try {
    return await fn(settings);
  } finally {
    setWorkSettings(previous);
  }
}
