import { createDataClient as createClient } from "@/lib/supabase/data";
import { addDaysIso, eachDateInclusive, isWeekendIso } from "@/lib/format";
import { formatLeaveComment, isUndecidedLeaveType, paidLeaveQuota, workingDatesInclusive } from "@/lib/leave";
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
          .select("id, employee_id, leave_type_id, start_date, end_date, days_count, status, reason")
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
  const covered = new Set<string>();
  for (const row of requests ?? []) {
    if (row.status !== "APPROVED") continue;
    for (const date of workingDatesInclusive(row.start_date, row.end_date)) {
      covered.add(`${row.employee_id}|${date}`);
    }
  }
  const { data: markedLeave } =
    employeeIds.length === 0
      ? { data: [] }
      : await supabase
          .from("attendance")
          .select("employee_id, attendance_date")
          .in("employee_id", employeeIds)
          .eq("status", "ON_LEAVE")
          .gte("attendance_date", start)
          .lte("attendance_date", end);
  for (const row of markedLeave ?? []) {
    if (isWeekendIso(row.attendance_date)) continue;
    if (covered.has(`${row.employee_id}|${row.attendance_date}`)) continue;
    usedByEmployee.set(row.employee_id, (usedByEmployee.get(row.employee_id) ?? 0) + 1);
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

export type LeaveDayNote = { subject: string; reason: string };

/** Approved leave comment for each employee and date. Pending is used only when that day has no approval. */
export async function leaveNotesByDay(employeeIds: string[], start: string, end: string) {
  const map = new Map<string, LeaveDayNote & { approved: boolean }>();
  if (employeeIds.length === 0) return map;
  const supabase = await createClient();
  const { data } = await supabase
    .from("leave_requests")
    .select("employee_id, start_date, end_date, status, reason")
    .in("employee_id", employeeIds)
    .lte("start_date", end)
    .gte("end_date", start)
    .in("status", ["APPROVED", "PENDING"]);

  for (const row of data ?? []) {
    const note = formatLeaveComment(row.reason);
    if (!note.reason) continue;
    const approved = row.status === "APPROVED";
    for (const date of eachDateInclusive(row.start_date, row.end_date)) {
      if (date < start || date > end) continue;
      const key = `${row.employee_id}|${date}`;
      const current = map.get(key);
      if (current?.approved && !approved) continue;
      map.set(key, { ...note, approved });
    }
  }
  return map;
}

export type LeaveHistoryRow = {
  key: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
  subject: string;
  reason: string;
  leaveTypeId: string | null;
  requestId: string | null;
};

/** Every leave request, plus attendance days marked on leave that have no request. */
export async function listLeaveHistory(employeeIds: string[], year: number): Promise<LeaveHistoryRow[]> {
  if (employeeIds.length === 0) return [];
  const supabase = await createClient();
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const [{ data: requests }, { data: marked }] = await Promise.all([
    supabase
      .from("leave_requests")
      .select("id, employee_id, leave_type_id, start_date, end_date, days_count, status, reason")
      .in("employee_id", employeeIds)
      .lte("start_date", end)
      .gte("end_date", start),
    supabase
      .from("attendance")
      .select("employee_id, attendance_date, notes")
      .in("employee_id", employeeIds)
      .eq("status", "ON_LEAVE")
      .gte("attendance_date", start)
      .lte("attendance_date", end)
      .order("attendance_date"),
  ]);

  const covered = new Set<string>();
  const rows: LeaveHistoryRow[] = (requests ?? []).map((row) => {
    if (row.status === "APPROVED") {
      for (const date of workingDatesInclusive(row.start_date, row.end_date)) {
        covered.add(`${row.employee_id}|${date}`);
      }
    }
    const note = formatLeaveComment(row.reason);
    return {
      key: row.id,
      employeeId: row.employee_id,
      startDate: row.start_date,
      endDate: row.end_date,
      days: Number(row.days_count) || workingDatesInclusive(row.start_date, row.end_date).length,
      status: row.status,
      subject: note.subject,
      reason: note.reason,
      leaveTypeId: row.leave_type_id,
      requestId: row.id,
    };
  });

  const loose = new Map<string, { date: string; notes: string }[]>();
  for (const row of marked ?? []) {
    if (isWeekendIso(row.attendance_date)) continue;
    if (covered.has(`${row.employee_id}|${row.attendance_date}`)) continue;
    const current = loose.get(row.employee_id) ?? [];
    current.push({ date: row.attendance_date, notes: row.notes ?? "" });
    loose.set(row.employee_id, current);
  }
  for (const [employeeId, entry] of loose) {
    const sorted = [...entry].sort((a, b) => a.date.localeCompare(b.date));
    let group: { start: string; end: string; days: number; notes: string } | null = null;
    const flush = () => {
      if (!group) return;
      const note = formatLeaveComment(group.notes);
      rows.push({
        key: `attendance:${employeeId}:${group.start}`,
        employeeId,
        startDate: group.start,
        endDate: group.end,
        days: group.days,
        status: "ON_LEAVE",
        subject: note.subject,
        reason: note.reason,
        leaveTypeId: null,
        requestId: null,
      });
      group = null;
    };
    for (const item of sorted) {
      let cursor = group ? addDaysIso(group.end, 1) : "";
      while (cursor && isWeekendIso(cursor)) cursor = addDaysIso(cursor, 1);
      const sameNote = group && (group.notes || "") === (item.notes || "");
      if (group && sameNote && cursor === item.date) {
        group.end = item.date;
        group.days += 1;
      } else {
        flush();
        group = { start: item.date, end: item.date, days: 1, notes: item.notes };
      }
    }
    flush();
  }

  return rows.sort((a, b) => b.startDate.localeCompare(a.startDate) || a.employeeId.localeCompare(b.employeeId));
}

export async function primaryPaidLeaveTypeId() {
  const supabase = await createClient();
  const { data } = await supabase.from("leave_types").select("id, name, is_paid").order("name");
  return (
    (data ?? []).find((row) => row.is_paid && !isUndecidedLeaveType(row.name))?.id ?? null
  );
}
