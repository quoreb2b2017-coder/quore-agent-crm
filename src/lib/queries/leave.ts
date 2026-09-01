import { createDataClient as createClient } from "@/lib/supabase/data";
import { paidLeaveQuota } from "@/lib/leave";

export async function getPaidLeaveQuota(options: {
  employeeIds: string[];
  year: number;
  people?: number;
}) {
  const people = options.people ?? Math.max(1, options.employeeIds.length);
  if (options.employeeIds.length === 0) {
    return paidLeaveQuota(0, 0, people);
  }

  const supabase = await createClient();
  const start = `${options.year}-01-01`;
  const end = `${options.year}-12-31`;

  const [{ data: requests }, { data: types }] = await Promise.all([
    supabase
      .from("leave_requests")
      .select("employee_id, leave_type_id, days_count, status")
      .in("employee_id", options.employeeIds)
      .gte("start_date", start)
      .lte("start_date", end),
    supabase.from("leave_types").select("id, is_paid"),
  ]);

  const paidIds = new Set((types ?? []).filter((row) => row.is_paid).map((row) => row.id));
  let used = 0;
  let pending = 0;
  for (const row of requests ?? []) {
    if (!paidIds.has(row.leave_type_id)) continue;
    const days = Number(row.days_count) || 0;
    if (row.status === "APPROVED") used += days;
    if (row.status === "PENDING") pending += days;
  }

  return paidLeaveQuota(used, pending, people);
}
