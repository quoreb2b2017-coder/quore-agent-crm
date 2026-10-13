import { createDataClient as createClient } from "@/lib/supabase/data";
import { isUndecidedLeaveType, paidLeaveQuota } from "@/lib/leave";
import { loadWorkSettings } from "@/lib/work-settings-server";

type PaidType = { id: string; name: string; is_paid: boolean };

async function paidLeaveContext(employeeIds: string[], year: number) {
  const supabase = await createClient();
  const settings = await loadWorkSettings();
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const [{ data: types }, { data: requests }, { data: balances }] = await Promise.all([
    supabase.from("leave_types").select("id, name, is_paid"),
    employeeIds.length === 0
      ? Promise.resolve({ data: [] })
      : supabase
          .from("leave_requests")
          .select("employee_id, leave_type_id, days_count, status")
          .in("employee_id", employeeIds)
          .gte("start_date", start)
          .lte("start_date", end),
    employeeIds.length === 0
      ? Promise.resolve({ data: [] })
      : supabase
          .from("leave_balances")
          .select("employee_id, leave_type_id, allocated_days")
          .eq("year", year)
          .in("employee_id", employeeIds),
  ]);

  const paid = ((types ?? []) as PaidType[])
    .filter((row) => row.is_paid && !isUndecidedLeaveType(row.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const paidIds = new Set(paid.map((row) => row.id));
  const primaryTypeId = paid[0]?.id ?? null;
  const usedByEmployee = new Map<string, number>();
  let pending = 0;
  for (const row of requests ?? []) {
    const days = Number(row.days_count) || 0;
    if (row.status === "PENDING") pending += days;
    if (!paidIds.has(row.leave_type_id)) continue;
    if (row.status === "APPROVED") {
      usedByEmployee.set(row.employee_id, (usedByEmployee.get(row.employee_id) ?? 0) + days);
    }
  }
  const allocatedByEmployee = new Map<string, number>();
  for (const row of balances ?? []) {
    if (row.leave_type_id !== primaryTypeId) continue;
    allocatedByEmployee.set(row.employee_id, Number(row.allocated_days));
  }
  return {
    primaryTypeId,
    defaultDays: settings.annualPaidLeaveDays,
    usedByEmployee,
    allocatedByEmployee,
    pending,
  };
}

function allocatedFor(
  employeeId: string,
  ctx: Awaited<ReturnType<typeof paidLeaveContext>>
) {
  return ctx.allocatedByEmployee.get(employeeId) ?? ctx.defaultDays;
}

export async function getPaidLeaveQuota(options: {
  employeeIds: string[];
  year: number;
  people?: number;
}) {
  const ids = options.employeeIds;
  if (ids.length === 0) return paidLeaveQuota(0, 0, options.people ?? 1);
  const ctx = await paidLeaveContext(ids, options.year);
  const used = ids.reduce((sum, id) => sum + (ctx.usedByEmployee.get(id) ?? 0), 0);
  const available = ids.reduce((sum, id) => sum + allocatedFor(id, ctx), 0);
  const remaining = Math.max(0, available - used);
  return {
    available,
    used,
    remaining,
    pending: ctx.pending,
    percentUsed: available > 0 ? Math.min(100, Math.round((used / available) * 100)) : 0,
  };
}

export type LeaveBalanceRow = {
  employeeId: string;
  fullName: string;
  employeeCode: string;
  used: number;
  allocated: number;
  remaining: number;
};

export async function getLeaveBalanceRows(
  employees: { id: string; full_name: string; employee_code: string }[],
  year: number
): Promise<LeaveBalanceRow[]> {
  if (employees.length === 0) return [];
  const ctx = await paidLeaveContext(
    employees.map((employee) => employee.id),
    year
  );
  return employees.map((employee) => {
    const used = ctx.usedByEmployee.get(employee.id) ?? 0;
    const allocated = allocatedFor(employee.id, ctx);
    return {
      employeeId: employee.id,
      fullName: employee.full_name,
      employeeCode: employee.employee_code,
      used,
      allocated,
      remaining: Math.max(0, allocated - used),
    };
  });
}

export async function primaryPaidLeaveTypeId() {
  const supabase = await createClient();
  const { data } = await supabase.from("leave_types").select("id, name, is_paid").order("name");
  return (
    (data ?? []).find((row) => row.is_paid && !isUndecidedLeaveType(row.name))?.id ?? null
  );
}
