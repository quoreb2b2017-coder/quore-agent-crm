import { createDataClient as createClient } from "@/lib/supabase/data";
import { monthStartEnd } from "@/lib/attendance-period";
import { formatDate } from "@/lib/format";
import {
  listWatchableEmployees,
  superAdminEmployeeIds,
} from "@/lib/queries/admin-dashboard";
import {
  autoGeneratePayrollMonth,
  isPayrollMonthReleased,
  payslipPayDateIso,
  setupAsOf,
  type SalarySetup,
} from "@/lib/payroll";
import {
  attendanceBreakdown,
  computePayslipAmounts,
  type ComputedPayslip,
} from "@/lib/salary-calc";

const EMPLOYEE_COLUMNS =
  "id, full_name, employee_code, email, salary, department_id, designation_id, joining_date, work_location";

export async function loadPayslipsForMonth(options: {
  month: string;
  employeeIds: string[];
  generatedBy?: string | null;
  persist?: boolean;
}): Promise<ComputedPayslip[]> {
  const ids = Array.from(new Set(options.employeeIds));
  if (ids.length === 0) return [];

  const supabase = await createClient();
  const { start, end } = monthStartEnd(options.month);
  const [year, monthNumber] = options.month.split("-").map(Number);
  const adminIds = new Set(await superAdminEmployeeIds(supabase));

  const [
    { data: people },
    { data: records },
    { data: departments },
    { data: designations },
    { data: attendance },
    { data: leaves },
    { data: leaveTypes },
  ] = await Promise.all([
    supabase.from("employees").select(EMPLOYEE_COLUMNS).in("id", ids),
    supabase
      .from("salary_records")
      .select("employee_id, effective_from, base_salary, pay_frequency, components, created_at")
      .in("employee_id", ids)
      .order("effective_from", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("departments").select("id, name"),
    supabase.from("designations").select("id, title"),
    supabase
      .from("attendance")
      .select("employee_id, attendance_date, status")
      .in("employee_id", ids)
      .gte("attendance_date", start)
      .lte("attendance_date", end),
    supabase
      .from("leave_requests")
      .select("employee_id, leave_type_id, start_date, end_date, status")
      .in("employee_id", ids)
      .eq("status", "APPROVED")
      .lte("start_date", end)
      .gte("end_date", start),
    supabase.from("leave_types").select("id, is_paid"),
  ]);

  const paidType = new Map((leaveTypes ?? []).map((row) => [row.id, row.is_paid]));
  const departmentName = new Map((departments ?? []).map((row) => [row.id, row.name]));
  const designationName = new Map((designations ?? []).map((row) => [row.id, row.title]));
  const attendanceByEmployee = new Map<string, { attendance_date: string; status: string }[]>();
  for (const row of attendance ?? []) {
    const list = attendanceByEmployee.get(row.employee_id) ?? [];
    list.push(row);
    attendanceByEmployee.set(row.employee_id, list);
  }
  const leaveByEmployee = new Map<string, { start: string; end: string; paid: boolean }[]>();
  for (const row of leaves ?? []) {
    const list = leaveByEmployee.get(row.employee_id) ?? [];
    list.push({
      start: row.start_date,
      end: row.end_date,
      paid: paidType.get(row.leave_type_id) !== false,
    });
    leaveByEmployee.set(row.employee_id, list);
  }

  const slips: ComputedPayslip[] = [];
  for (const employee of people ?? []) {
    if (adminIds.has(employee.id)) continue;
    const setup = setupAsOf(records ?? [], employee.id, end, employee.salary);
    if (!setup) continue;
    slips.push(
      buildComputedPayslip({
        employee,
        setup,
        month: options.month,
        department: employee.department_id ? departmentName.get(employee.department_id) ?? "" : "",
        designation: employee.designation_id ? designationName.get(employee.designation_id) ?? "" : "",
        attendance: attendanceByEmployee.get(employee.id) ?? [],
        leaves: leaveByEmployee.get(employee.id) ?? [],
      })
    );
  }

  if (options.persist && slips.length > 0) {
    const { data: existing } = await supabase
      .from("salary_slips")
      .select("employee_id, status")
      .eq("period_year", year)
      .eq("period_month", monthNumber)
      .in(
        "employee_id",
        slips.map((slip) => slip.employeeId)
      );
    const paid = new Set(
      (existing ?? []).filter((row) => row.status === "PAID").map((row) => row.employee_id)
    );

    for (const slip of slips) {
      if (paid.has(slip.employeeId)) continue;
      await supabase.from("salary_slips").upsert(
        {
          employee_id: slip.employeeId,
          period_year: year,
          period_month: monthNumber,
          gross_amount: slip.gross,
          net_amount: slip.net,
          deductions: {
            total: slip.totalDeductions,
            earnings: slip.earnings,
            lines: slip.deductions,
            lopDays: slip.attendance.lopDays,
            paidDays: slip.attendance.paidDays,
            officeDays: slip.attendance.officeDays,
            paidLeaveDays: slip.attendance.paidLeaveDays,
            unpaidLeaveDays: slip.attendance.unpaidLeaveDays,
            absentDays: slip.attendance.absentDays,
            weekOffDays: slip.attendance.weekOffDays,
            payDate: slip.payDate,
            packageGross: slip.packageGross,
          },
          status: "FINALIZED",
          generated_at: new Date().toISOString(),
          generated_by: options.generatedBy ?? null,
        },
        { onConflict: "employee_id,period_year,period_month" }
      );
    }
  }

  return slips;
}

function buildComputedPayslip(input: {
  employee: {
    id: string;
    full_name: string;
    employee_code: string;
    email: string;
    joining_date: string;
    work_location: string | null;
  };
  setup: SalarySetup;
  month: string;
  department: string;
  designation: string;
  attendance: Array<{ attendance_date: string; status: string }>;
  leaves: Array<{ start: string; end: string; paid: boolean }>;
}): ComputedPayslip {
  const attendance = attendanceBreakdown({
    period: input.month,
    joiningDate: input.employee.joining_date,
    attendance: input.attendance,
    leaves: input.leaves,
  });
  const amounts = computePayslipAmounts(input.setup, attendance.paidDays);
  return {
    employeeId: input.employee.id,
    fullName: input.employee.full_name,
    employeeCode: input.employee.employee_code,
    email: input.employee.email,
    department: input.department,
    designation: input.designation,
    location: input.employee.work_location ?? "",
    joiningDate: input.employee.joining_date
      ? formatDate(`${input.employee.joining_date.slice(0, 10)}T12:00:00+05:30`)
      : "",
    month: input.month,
    payDate: payslipPayDateIso(input.month),
    payFrequency: input.setup.payFrequency,
    packageGross: input.setup.packageGross,
    ...amounts,
    attendance,
  };
}

export async function ensureAutoSalarySlips(generatedBy?: string | null) {
  try {
    const month = autoGeneratePayrollMonth();
    const people = await listWatchableEmployees();
    return await loadPayslipsForMonth({
      month,
      employeeIds: people.map((person) => person.id),
      generatedBy,
      persist: true,
    });
  } catch (error) {
    console.error("Failed to auto-generate salary slips", error);
    return [];
  }
}

export async function refreshEmployeeSalarySlips(employeeId: string, generatedBy?: string | null) {
  const supabase = await createClient();
  const released = autoGeneratePayrollMonth();
  const { data: existing } = await supabase
    .from("salary_slips")
    .select("period_year, period_month, status")
    .eq("employee_id", employeeId);

  const months = new Set<string>([released]);
  for (const row of existing ?? []) {
    if (row.status === "PAID") continue;
    months.add(`${row.period_year}-${String(row.period_month).padStart(2, "0")}`);
  }

  const results: ComputedPayslip[] = [];
  for (const period of months) {
    results.push(
      ...(await loadPayslipsForMonth({
        month: period,
        employeeIds: [employeeId],
        generatedBy,
        persist: isPayrollMonthReleased(period) || existing?.some((row) => {
          const key = `${row.period_year}-${String(row.period_month).padStart(2, "0")}`;
          return key === period && row.status !== "PAID";
        }),
      }))
    );
  }
  return results;
}

export async function loadOnePayslip(employeeId: string, month: string, generatedBy?: string | null) {
  const slips = await loadPayslipsForMonth({
    month,
    employeeIds: [employeeId],
    generatedBy,
    persist: isPayrollMonthReleased(month),
  });
  return slips[0] ?? null;
}
