import { NextResponse } from "next/server";
import { getCurrentEmployeeContext, isSuperAdmin } from "@/lib/permissions/server";
import { parseMonthParam, isPayrollMonthReleased } from "@/lib/payroll";
import { isUuid } from "@/lib/attendance-period";
import { listWatchableEmployees, isSuperAdminEmployee } from "@/lib/queries/admin-dashboard";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { loadPayslipsForMonth } from "@/lib/salary-slip-generate";
import { buildSalarySlipPdf, buildSalaryTeamReportPdf, computedToPdfInput } from "@/lib/salary-slip-pdf";

export const runtime = "nodejs";

function pdfResponse(bytes: Uint8Array, filename: string) {
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const employeeParam = url.searchParams.get("employee") ?? "";
  const month = parseMonthParam(url.searchParams.get("month") ?? undefined);
  const requestedId = isUuid(employeeParam) ? employeeParam : null;
  const wantsAll = !requestedId && isSuperAdmin(ctx.roleKey);
  const employeeId = requestedId ?? (isSuperAdmin(ctx.roleKey) ? null : ctx.employeeId);

  if (!employeeId && !wantsAll) {
    return NextResponse.json({ error: "Select an employee to download a slip." }, { status: 400 });
  }

  if (employeeId && !isSuperAdmin(ctx.roleKey) && employeeId !== ctx.employeeId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const supabase = await createClient();
  if (employeeId && (await isSuperAdminEmployee(supabase, employeeId))) {
    return NextResponse.json({ error: "Super Admin does not receive a payslip." }, { status: 400 });
  }

  const people = employeeId
    ? [{ id: employeeId }]
    : await listWatchableEmployees();
  const employeeIds = people.map((person) => person.id);
  const persist = isPayrollMonthReleased(month);

  const slips = await loadPayslipsForMonth({
    month,
    employeeIds,
    generatedBy: ctx.employeeId,
    persist,
  });

  if (slips.length === 0) {
    return NextResponse.json({ error: "Payroll is not set up for this selection." }, { status: 400 });
  }

  const pdfInputs = slips.map(computedToPdfInput);

  if (pdfInputs.length === 1 && employeeId) {
    const bytes = await buildSalarySlipPdf(pdfInputs[0]);
    return pdfResponse(bytes, `payslip-${pdfInputs[0].employeeCode}-${month}.pdf`);
  }

  const bytes = await buildSalaryTeamReportPdf(pdfInputs);
  return pdfResponse(bytes, `payroll-statement-${month}.pdf`);
}
