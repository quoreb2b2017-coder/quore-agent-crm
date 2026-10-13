import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { todayIso } from "@/lib/format";
import { SUPER_ADMIN_ROLE } from "@/lib/permissions/roles";
import { federalHolidays } from "@/lib/federal-holidays";
import { loadWorkSettings } from "@/lib/work-settings-server";

let ensuredKey = "";

/**
 * Marks this year's US federal holidays as Holiday for every employee.
 * Does not overwrite a day that is already present, late, leave, half day, or week off.
 * Runs at most once per shift date per server process.
 */
export async function ensureFederalHolidaysMarked() {
  await loadWorkSettings();
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const key = `${year}:${today}`;
  if (ensuredKey === key) return;
  ensuredKey = key;

  try {
    const service = createServiceClient();
    const holidays = federalHolidays(year);
    const dates = holidays.map((holiday) => holiday.date);
    const nameByDate = new Map(holidays.map((holiday) => [holiday.date, holiday.name]));

    const { data: role } = await service
      .from("roles")
      .select("id")
      .eq("role_key", SUPER_ADMIN_ROLE)
      .maybeSingle();
    const { data: superAdmins } = role
      ? await service.from("employee_roles").select("employee_id").eq("role_id", role.id)
      : { data: [] };
    const skip = new Set((superAdmins ?? []).map((row) => row.employee_id));

    const { data: employees } = await service
      .from("employees")
      .select("id")
      .neq("employment_status", "TERMINATED");
    const ids = (employees ?? []).map((row) => row.id).filter((id) => !skip.has(id));
    if (ids.length === 0 || dates.length === 0) return;

    const { data: existing } = await service
      .from("attendance")
      .select("id, employee_id, attendance_date, status")
      .in("employee_id", ids)
      .in("attendance_date", dates);

    const byKey = new Map(
      (existing ?? []).map((row) => [`${row.employee_id}|${row.attendance_date}`, row])
    );
    const inserts: {
      employee_id: string;
      attendance_date: string;
      status: "HOLIDAY";
      source: "AUTO";
      notes: string;
    }[] = [];
    const absentByDate = new Map<string, string[]>();

    for (const employeeId of ids) {
      for (const date of dates) {
        const row = byKey.get(`${employeeId}|${date}`);
        const notes = `US federal holiday: ${nameByDate.get(date)}`;
        if (!row) {
          inserts.push({
            employee_id: employeeId,
            attendance_date: date,
            status: "HOLIDAY",
            source: "AUTO",
            notes,
          });
        } else if (row.status === "ABSENT") {
          absentByDate.set(date, [...(absentByDate.get(date) ?? []), row.id]);
        }
      }
    }

    if (inserts.length > 0) {
      const { error } = await service.from("attendance").insert(inserts);
      if (error) ensuredKey = "";
    }
    for (const [date, rowIds] of absentByDate) {
      await service
        .from("attendance")
        .update({
          status: "HOLIDAY",
          source: "AUTO",
          notes: `US federal holiday: ${nameByDate.get(date)}`,
        })
        .in("id", rowIds);
    }
  } catch {
    ensuredKey = "";
  }
}
