import { NextResponse } from "next/server";
import { finishSheet } from "@/lib/activity-excel";
import { formatDuration, formatIsoDate } from "@/lib/format";
import { getCurrentEmployeeContext, isManagement } from "@/lib/permissions/server";
import { listWatchableEmployees } from "@/lib/queries/admin-dashboard";
import { getProductivityReport } from "@/lib/queries/productivity-report";
import { parseProductivityQuery } from "@/lib/productivity-period";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const RED = "FFB42318";
const GREEN = "FF067647";

/** The Productivity page's period as a workbook: a total per person and every working day. */
export async function GET(request: Request) {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const seesAll = isManagement(ctx.roleKey);

  const params = Object.fromEntries(new URL(request.url).searchParams);
  // Staff only ever get their own numbers, whatever the link says.
  const query = parseProductivityQuery(params, seesAll ? null : ctx.employeeId);
  let people: { id: string; full_name: string; employee_code: string }[];
  if (seesAll) {
    const watchable = await listWatchableEmployees();
    people = query.employeeId ? watchable.filter((person) => person.id === query.employeeId) : watchable;
  } else {
    const { data } = await createServiceClient()
      .from("employees")
      .select("id, full_name, employee_code")
      .eq("id", ctx.employeeId)
      .maybeSingle();
    people = data ? [data] : [];
  }

  const rows = (await getProductivityReport(people, query.start, query.end)).sort((a, b) =>
    a.employee.full_name.localeCompare(b.employee.full_name)
  );

  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();

  const summary = workbook.addWorksheet("Summary");
  summary.columns = [
    { header: "Name", key: "name", width: 26 },
    { header: "Employee ID", key: "code", width: 14 },
    { header: "Productive", key: "productive", width: 12 },
    { header: "Target (period)", key: "target", width: 15 },
    { header: "Days on target", key: "met", width: 14 },
    { header: "Working days so far", key: "counted", width: 18 },
    { header: "Balance", key: "balance", width: 12 },
    { header: "Break", key: "break", width: 10 },
    { header: "Excess break", key: "excess", width: 13 },
    { header: "Idle", key: "idle", width: 10 },
  ];
  for (const row of rows) {
    const added = summary.addRow({
      name: row.employee.full_name,
      code: row.employee.employee_code,
      productive: formatDuration(row.productiveSeconds),
      target: formatDuration(row.periodTargetSeconds),
      met: row.daysMet,
      counted: row.countedDays,
      balance: `${row.balanceSeconds < 0 ? "-" : "+"}${formatDuration(Math.abs(row.balanceSeconds))}`,
      break: formatDuration(row.breakSeconds),
      excess: row.breakExcess.total > 0 ? formatDuration(row.breakExcess.total) : "",
      idle: formatDuration(row.idleSeconds),
    });
    added.getCell("balance").font = { bold: true, color: { argb: row.balanceSeconds < 0 ? RED : GREEN } };
    if (row.breakExcess.total > 0) added.getCell("excess").font = { bold: true, color: { argb: RED } };
  }
  finishSheet(summary);

  const days = workbook.addWorksheet("Days");
  days.columns = [
    { header: "Name", key: "name", width: 26 },
    { header: "Employee ID", key: "code", width: 14 },
    { header: "Date", key: "date", width: 16 },
    { header: "Day", key: "status", width: 12 },
    { header: "Productive", key: "productive", width: 12 },
    { header: "Target", key: "target", width: 10 },
    { header: "Result", key: "result", width: 11 },
    { header: "Break", key: "break", width: 10 },
    { header: "Excess break", key: "excess", width: 13 },
    { header: "Idle", key: "idle", width: 10 },
  ];
  for (const row of rows) {
    for (const day of row.days) {
      if (day.status === "upcoming") continue;
      const off = day.status === "off";
      const met = !off && day.productiveSeconds >= day.targetSeconds;
      const added = days.addRow({
        name: row.employee.full_name,
        code: row.employee.employee_code,
        date: formatIsoDate(day.date),
        status: off ? (day.offStatus ?? "Off").replaceAll("_", " ").toLowerCase() : (day.attendanceStatus ?? "").toLowerCase(),
        productive: formatDuration(day.productiveSeconds),
        target: off ? "" : formatDuration(day.targetSeconds),
        result: off ? "" : met ? "On target" : "Short",
        break: formatDuration(day.breakSeconds),
        excess: day.breakExcess.total > 0 ? formatDuration(day.breakExcess.total) : "",
        idle: formatDuration(day.idleSeconds),
      });
      if (!off) added.getCell("result").font = { bold: true, color: { argb: met ? GREEN : RED } };
      if (day.breakExcess.total > 0) added.getCell("excess").font = { bold: true, color: { argb: RED } };
    }
  }
  finishSheet(days);

  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="productivity-${query.start}-to-${query.end}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
