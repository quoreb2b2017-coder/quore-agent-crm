import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { trustedNowDate } from "@/lib/clock-anchor";
import { calendarDateInZone, INDIA_TIME_ZONE } from "@/lib/format";
import { celebrationsOn, type Celebration } from "@/lib/celebrations";

export function celebrationDateIso() {
  return calendarDateInZone(trustedNowDate(), INDIA_TIME_ZONE);
}

export async function getTodayCelebrations(todayIso = celebrationDateIso()): Promise<Celebration[]> {
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
