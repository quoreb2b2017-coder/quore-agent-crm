import { NextResponse } from "next/server";
import { finishSheet } from "@/lib/activity-excel";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { isManagement } from "@/lib/permissions/roles";
import { loadEmployeeListRows } from "@/lib/queries/employee-list";

export const runtime = "nodejs";

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  ON_LEAVE: "On leave",
  SUSPENDED: "Blocked",
  TERMINATED: "Archived",
};

/** The Employees list as the viewer sees it, ready for Excel. */
export async function GET() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isManagement(ctx.roleKey)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const rows = await loadEmployeeListRows(ctx);
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Employees");
  sheet.columns = [
    { header: "Name", key: "name", width: 26 },
    { header: "Employee ID", key: "code", width: 14 },
    { header: "Department", key: "department", width: 18 },
    { header: "Email", key: "email", width: 30 },
    { header: "Phone", key: "phone", width: 16 },
    { header: "Shift", key: "shift", width: 22 },
    { header: "Own shift", key: "customShift", width: 11 },
    { header: "Status", key: "status", width: 11 },
  ];
  for (const row of rows) {
    sheet.addRow({
      name: row.fullName,
      code: row.employeeCode,
      department: row.departmentName,
      email: row.email,
      phone: row.phone ?? "",
      shift: row.shiftLabel,
      customShift: row.hasCustomShift ? "Yes" : "No",
      status: STATUS_LABEL[row.employmentStatus] ?? row.employmentStatus,
    });
  }
  finishSheet(sheet);

  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="employees-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
