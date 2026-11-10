import "server-only";

import { createDataClient as createClient } from "@/lib/supabase/data";
import {
  readSalaryComponents,
  salaryFixedDeductions,
  salaryPackageGross,
  type PayLine,
  type SalaryComponents,
} from "@/lib/payroll";
import { excludeIds, superAdminEmployeeIds } from "@/lib/queries/admin-dashboard";

export type PayrollRow = {
  id: string;
  full_name: string;
  employee_code: string;
  base: number | null;
  hra: number;
  allowance: number;
  conveyance: number;
  incomeTax: number;
  providentFund: number;
  professionalTax: number;
  extraEarnings: PayLine[];
  extraDeductions: PayLine[];
  deductions: number;
  gross: number | null;
  pay_frequency: string | null;
  effective_from: string | null;
};

/** Everyone on (or due for) payroll with their current salary set-up. Super Admin and archived people are left out. */
export async function loadPayrollRows(): Promise<PayrollRow[]> {
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
    { effective_from: string; base_salary: number; pay_frequency: string; components: SalaryComponents }
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

  return (employees ?? []).map((employee) => {
    const setup = latestByEmployee.get(employee.id);
    const components = setup?.components;
    const base = setup?.base_salary ?? employee.salary ?? null;
    return {
      id: employee.id,
      full_name: employee.full_name,
      employee_code: employee.employee_code,
      base,
      hra: components?.hra ?? 0,
      allowance: components?.allowance ?? 0,
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
}
