import { BadgeIndianRupee, Users, CircleAlert } from "lucide-react";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { requireSuperAdmin } from "@/lib/permissions/server";
import { formatInr } from "@/lib/format";
import {
  readSalaryComponents,
  salaryFixedDeductions,
  salaryPackageGross,
  type SalaryComponents,
} from "@/lib/payroll";
import { excludeIds, superAdminEmployeeIds } from "@/lib/queries/admin-dashboard";
import { SetupPayrollSheet } from "./setup-payroll-sheet";
import { PayrollTable, type PayrollRow } from "./payroll-table";

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireSuperAdmin();
  const params = await searchParams;
  const requestedEmployee = Array.isArray(params.employee) ? params.employee[0] : params.employee;

  const supabase = await createClient();
  const adminIds = await superAdminEmployeeIds(supabase);
  const skip = excludeIds(adminIds);

  let employeesQuery = supabase
    .from("employees")
    .select("id, full_name, employee_code, salary, employment_status")
    .neq("employment_status", "TERMINATED")
    .order("full_name");
  if (skip) employeesQuery = employeesQuery.not("id", "in", skip);

  const [{ data: employees }, { data: records }] = await Promise.all([
    employeesQuery,
    supabase
      .from("salary_records")
      .select("id, employee_id, effective_from, base_salary, pay_frequency, components, created_at")
      .order("effective_from", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const latestByEmployee = new Map<
    string,
    {
      effective_from: string;
      base_salary: number;
      pay_frequency: string;
      components: SalaryComponents;
    }
  >();
  for (const record of records ?? []) {
    if (latestByEmployee.has(record.employee_id)) continue;
    latestByEmployee.set(record.employee_id, {
      effective_from: record.effective_from,
      base_salary: Number(record.base_salary),
      pay_frequency: record.pay_frequency,
      components: readSalaryComponents(record.components),
    });
  }

  const rows: PayrollRow[] = (employees ?? []).map((employee) => {
    const setup = latestByEmployee.get(employee.id);
    const components = setup?.components;
    const base = setup?.base_salary ?? employee.salary ?? null;
    const hra = components?.hra ?? 0;
    const allowance = components?.allowance ?? 0;
    return {
      id: employee.id,
      full_name: employee.full_name,
      employee_code: employee.employee_code,
      base,
      hra,
      allowance,
      conveyance: components?.conveyance ?? 0,
      incomeTax: components?.incomeTax ?? 0,
      providentFund: components?.providentFund ?? 0,
      professionalTax: components?.professionalTax ?? 0,
      extraEarnings: components?.extraEarnings ?? [],
      extraDeductions: components?.extraDeductions ?? [],
      deductions: components ? salaryFixedDeductions(components) : 0,
      gross: base == null || !components ? base : salaryPackageGross(base, components),
      pay_frequency: setup?.pay_frequency ?? null,
      effective_from: setup?.effective_from ?? null,
    };
  });

  const options = (employees ?? []).map((employee) => ({
    id: employee.id,
    full_name: employee.full_name,
    employee_code: employee.employee_code,
  }));
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
          <SetupPayrollSheet
            employees={options}
            defaults={presetEmployee ? { employeeId: presetEmployee } : undefined}
          />
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
