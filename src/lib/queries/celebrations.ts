import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { trustedNowDate } from "@/lib/clock-anchor";
import { calendarDateInZone, INDIA_TIME_ZONE } from "@/lib/format";
import { celebrationsOn, type Celebration } from "@/lib/celebrations";

export function celebrationDateIso() {
  return calendarDateInZone(trustedNowDate(), INDIA_TIME_ZONE);
}

const CACHE_MS = 10 * 60 * 1000;
let cached: { date: string; at: number; value: Celebration[] } | null = null;

/**
 * Today's birthdays and work anniversaries. Rendered by every layout, so the
 * result is kept for 10 minutes per server instance (it only changes with the
 * date, new joiners or edited birth dates).
 */
export async function getTodayCelebrations(todayIso = celebrationDateIso()): Promise<Celebration[]> {
  if (cached && cached.date === todayIso && Date.now() - cached.at < CACHE_MS) return cached.value;
  const value = await loadTodayCelebrations(todayIso);
  cached = { date: todayIso, at: Date.now(), value };
  return value;
}

async function loadTodayCelebrations(todayIso: string): Promise<Celebration[]> {
  const service = createServiceClient();
  const [{ data: employees }, { data: onboarding }] = await Promise.all([
    service
      .from("employees")
      .select("id, full_name, joining_date")
      .eq("employment_status", "ACTIVE"),
    service.from("employee_onboarding").select("employee_id, date_of_birth").not("date_of_birth", "is", null),
  ]);
  if (!employees?.length) return [];

  const birthdays = new Map((onboarding ?? []).map((row) => [row.employee_id, row.date_of_birth]));
  return celebrationsOn(
    employees.map((employee) => ({
      employeeId: employee.id,
      fullName: employee.full_name,
      joiningDate: employee.joining_date,
      dateOfBirth: birthdays.get(employee.id) ?? null,
    })),
    todayIso
  );
}
