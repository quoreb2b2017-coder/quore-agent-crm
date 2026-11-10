import { NextResponse } from "next/server";
import { finishSheet } from "@/lib/activity-excel";
import { isUuid } from "@/lib/attendance-period";
import { formatIsoDate, todayIso } from "@/lib/format";
import { getCurrentEmployeeContext, isManagement } from "@/lib/permissions/server";
import { listWatchableEmployees } from "@/lib/queries/admin-dashboard";
import { getLeaveBalanceRows, listLeaveHistory } from "@/lib/queries/leave";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function statusLabel(status: string) {
  const text = status.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The Leave page as a workbook: paid days left per person, and every request this year. */
export async function GET(request: Request) {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const seesAll = isManagement(ctx.roleKey);

  const url = new URL(request.url);
  const yearParam = Number(url.searchParams.get("year"));
  const year = Number.isInteger(yearParam) && yearParam > 2000 ? yearParam : Number(todayIso().slice(0, 4));
  const requested = url.searchParams.get("employee");

  const service = createServiceClient();
  // Staff only ever get their own leave, whatever the link says.
  const people = seesAll
    ? (await listWatchableEmployees()).filter((person) => !requested || !isUuid(requested) || person.id === requested)
    : ((await service.from("employees").select("id, full_name, employee_code").eq("id", ctx.employeeId)).data ?? []);
  const byId = new Map(people.map((person) => [person.id, person]));

  const [balances, history, { data: types }] = await Promise.all([
    getLeaveBalanceRows(people, year),
    listLeaveHistory(people.map((person) => person.id), year),
    service.from("leave_types").select("id, name, is_paid"),
  ]);
  const typeById = new Map((types ?? []).map((type) => [type.id, type]));

  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();

  const balanceSheet = workbook.addWorksheet("Paid leave balance");
  balanceSheet.columns = [
    { header: "Name", key: "name", width: 26 },
    { header: "Employee ID", key: "code", width: 14 },
    { header: `Allocated ${year}`, key: "allocated", width: 14 },
    { header: "Used", key: "used", width: 9 },
    { header: "Left", key: "remaining", width: 9 },
  ];
  for (const row of balances) {
    balanceSheet.addRow({
      name: row.fullName,
      code: row.employeeCode,
      allocated: row.allocated,
      used: row.used,
      remaining: row.remaining,
    });
  }
  finishSheet(balanceSheet);

  const requests = workbook.addWorksheet("Requests");
  requests.columns = [
    { header: "Name", key: "name", width: 26 },
    { header: "Employee ID", key: "code", width: 14 },
    { header: "From", key: "start", width: 14 },
    { header: "To", key: "end", width: 14 },
    { header: "Working days", key: "days", width: 13 },
    { header: "Type", key: "type", width: 20 },
    { header: "Paid", key: "paid", width: 7 },
    { header: "Status", key: "status", width: 11 },
    { header: "Subject", key: "subject", width: 26 },
    { header: "Reason", key: "reason", width: 44 },
  ];
  const sorted = [...history].sort(
    (a, b) =>
      (byId.get(a.employeeId)?.full_name ?? "").localeCompare(byId.get(b.employeeId)?.full_name ?? "") ||
      a.startDate.localeCompare(b.startDate)
  );
  for (const row of sorted) {
    const person = byId.get(row.employeeId);
    const type = row.leaveTypeId ? typeById.get(row.leaveTypeId) : undefined;
    requests.addRow({
      name: person?.full_name ?? "",
      code: person?.employee_code ?? "",
      start: formatIsoDate(row.startDate),
      end: formatIsoDate(row.endDate),
      days: row.days,
      type: type?.name ?? "Marked on attendance",
      paid: type ? (type.is_paid ? "Yes" : "No") : "",
      status: statusLabel(row.status),
      subject: row.subject,
      reason: row.reason,
    });
  }
  finishSheet(requests);

  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="leave-${year}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
