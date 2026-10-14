"use server";

import { getCurrentEmployeeContext, isSuperAdmin } from "@/lib/permissions/server";
import { listWatchableEmployees } from "@/lib/queries/admin-dashboard";
import { buildActivityDays, type ActivityDayLog } from "@/lib/queries/shift-activity";

const DAY_COUNT = 12;

export type { ActivityDayLog };

export type EmployeeActivityLog = {
  fullName: string;
  employeeCode: string;
  days: ActivityDayLog[];
};

export async function loadEmployeeActivityLog(
  employeeId: string
): Promise<EmployeeActivityLog | { error: string }> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isSuperAdmin(ctx.roleKey)) return { error: "Not authorized" };

  const people = await listWatchableEmployees();
  const person = people.find((employee) => employee.id === employeeId);
  if (!person) return { error: "Employee not found." };

  const days = await buildActivityDays(
    { id: person.id, fullName: person.full_name, employeeCode: person.employee_code },
    DAY_COUNT
  );

  return {
    fullName: person.full_name,
    employeeCode: person.employee_code,
    days,
  };
}
