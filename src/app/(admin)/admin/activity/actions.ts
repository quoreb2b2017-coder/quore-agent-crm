"use server";

import { addDaysIso, formatIsoDate, isWeekendIso, todayIso, weekdayShortIst } from "@/lib/format";
import { getCurrentEmployeeContext, isSuperAdmin } from "@/lib/permissions/server";
import { listWatchableEmployees } from "@/lib/queries/admin-dashboard";
import { getShiftActivity, type ShiftActivityEvent } from "@/lib/queries/shift-activity";

const DAY_COUNT = 12;

export type ActivityDayLog = {
  date: string;
  weekday: string;
  day: string;
  label: string;
  today: boolean;
  weekend: boolean;
  events: ShiftActivityEvent[];
};

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

  const today = todayIso();
  const oldest = addDaysIso(today, -(DAY_COUNT - 1));
  const events = await getShiftActivity(
    [{ id: person.id, fullName: person.full_name, employeeCode: person.employee_code }],
    oldest,
    today
  );
  const byDate = new Map<string, ShiftActivityEvent[]>();
  for (const event of events) {
    const list = byDate.get(event.shiftDate) ?? [];
    list.push(event);
    byDate.set(event.shiftDate, list);
  }

  const days: ActivityDayLog[] = Array.from({ length: DAY_COUNT }, (_, index) => {
    const date = addDaysIso(today, -index);
    return {
      date,
      weekday: date === today ? "Today" : weekdayShortIst(date),
      day: String(Number(date.slice(8, 10))),
      label: formatIsoDate(date),
      today: date === today,
      weekend: isWeekendIso(date),
      events: byDate.get(date) ?? [],
    };
  });

  return {
    fullName: person.full_name,
    employeeCode: person.employee_code,
    days,
  };
}
