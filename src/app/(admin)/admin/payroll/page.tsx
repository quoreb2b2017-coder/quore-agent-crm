import { BadgeIndianRupee, Users, CircleAlert } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { requireManagement } from "@/lib/permissions/server";
import { formatInr } from "@/lib/format";
import { loadPayrollRows } from "@/lib/queries/payroll-rows";
import { ExcelDownloadButton } from "@/components/activity/excel-download-button";
import { SetupPayrollSheet } from "./setup-payroll-sheet";
import { PayrollTable } from "./payroll-table";

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireManagement();
  const params = await searchParams;
  const requestedEmployee = Array.isArray(params.employee) ? params.employee[0] : params.employee;

  const rows = await loadPayrollRows();

  const options = rows.map((row) => ({ id: row.id, full_name: row.full_name, employee_code: row.employee_code }));
  const presetEmployee = options.some((employee) => employee.id === requestedEmployee)
    ? requestedEmployee
    : undefined;

  const onPayroll = rows.filter((row) => row.base != null).length;
  const notSetup = rows.length - onPayroll;
  const monthlyTotal = rows.reduce((sum, row) => sum + (row.gross ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payroll"
        description="30-day payment cycle. Unpaid leave and absences reduce paid days. Payslips generate on the 10th and update when you edit."
        actions={
          <div className="flex flex-wrap gap-2">
            <ExcelDownloadButton href="/api/payroll/excel" />
            <SetupPayrollSheet
              employees={options}
              defaults={presetEmployee ? { employeeId: presetEmployee } : undefined}
            />
          </div>
        }
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Monthly payroll"
          value={formatInr(monthlyTotal)}
          icon={BadgeIndianRupee}
          tone="success"
        />
        <StatCard label="On payroll" value={onPayroll} icon={Users} hint={`${rows.length} people`} />
        <StatCard
          label="Not set up"
          value={notSetup}
          icon={CircleAlert}
          tone={notSetup > 0 ? "warning" : "default"}
        />
      </section>

      <PayrollTable rows={rows} employees={options} />
    </div>
  );
}
