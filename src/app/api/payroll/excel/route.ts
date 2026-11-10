import { NextResponse } from "next/server";
import { finishSheet } from "@/lib/activity-excel";
import { formatIsoDate } from "@/lib/format";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { isManagement } from "@/lib/permissions/roles";
import { loadPayrollRows } from "@/lib/queries/payroll-rows";

export const runtime = "nodejs";

/** The Payroll page as a workbook: one row per person with every pay line. Super Admin and HR only. */
export async function GET() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isManagement(ctx.roleKey)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const rows = await loadPayrollRows();
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Payroll");
  sheet.columns = [
    { header: "Name", key: "name", width: 26 },
    { header: "Employee ID", key: "code", width: 14 },
    { header: "Base", key: "base", width: 12 },
    { header: "HRA", key: "hra", width: 10 },
    { header: "Allowance", key: "allowance", width: 11 },
    { header: "Conveyance", key: "conveyance", width: 12 },
    { header: "Other earnings", key: "extraEarnings", width: 26 },
    { header: "Gross", key: "gross", width: 12 },
    { header: "Income tax", key: "incomeTax", width: 11 },
    { header: "PF", key: "providentFund", width: 10 },
    { header: "Prof. tax", key: "professionalTax", width: 10 },
    { header: "Other deductions", key: "extraDeductions", width: 26 },
    { header: "Total deductions", key: "deductions", width: 15 },
    { header: "Net", key: "net", width: 12 },
    { header: "Frequency", key: "frequency", width: 11 },
    { header: "Effective from", key: "effectiveFrom", width: 15 },
  ];
  const lines = (list: { name: string; amount: number }[]) =>
    list.map((line) => `${line.name}: ${line.amount}`).join(", ");
  for (const row of rows) {
    const added = sheet.addRow({
      name: row.full_name,
      code: row.employee_code,
      base: row.base ?? "",
      hra: row.hra,
      allowance: row.allowance,
      conveyance: row.conveyance,
      extraEarnings: lines(row.extraEarnings),
      gross: row.gross ?? "",
      incomeTax: row.incomeTax,
      providentFund: row.providentFund,
      professionalTax: row.professionalTax,
      extraDeductions: lines(row.extraDeductions),
      deductions: row.deductions,
      net: row.gross == null ? "" : row.gross - row.deductions,
      frequency: row.pay_frequency?.toLowerCase() ?? "Not set up",
      effectiveFrom: row.effective_from ? formatIsoDate(row.effective_from) : "",
    });
    for (const key of ["base", "hra", "allowance", "conveyance", "gross", "incomeTax", "providentFund", "professionalTax", "deductions", "net"]) {
      added.getCell(key).numFmt = "#,##0";
    }
  }
  finishSheet(sheet);

  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="payroll-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
