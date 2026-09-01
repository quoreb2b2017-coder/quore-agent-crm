"use client";

import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import { formatMonthLabel } from "@/lib/format";

export function SalarySlipFilters({
  employees,
  employeeId,
  month,
  months,
}: {
  employees: { id: string; full_name: string; employee_code: string }[];
  employeeId: string | null;
  month: string;
  months: string[];
}) {
  const router = useRouter();

  function go(next: { employeeId?: string | null; month?: string }) {
    const params = new URLSearchParams();
    const nextEmployee = next.employeeId === undefined ? employeeId : next.employeeId;
    const nextMonth = next.month ?? month;
    if (nextEmployee) params.set("employee", nextEmployee);
    if (nextMonth) params.set("month", nextMonth);
    const query = params.toString();
    router.push(query ? `/admin/salary-slips?${query}` : "/admin/salary-slips");
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card/90 p-4 sm:flex-row sm:items-end">
      <div className="grid min-w-0 flex-1 gap-2">
        <Label htmlFor="slip-employee">Employee</Label>
        <select
          id="slip-employee"
          value={employeeId ?? ""}
          onChange={(event) => go({ employeeId: event.target.value || null })}
          className={NATIVE_SELECT_CLASS}
        >
          <option value="">All employees</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.full_name} ({employee.employee_code})
            </option>
          ))}
        </select>
      </div>
      <div className="grid min-w-0 flex-1 gap-2">
        <Label htmlFor="slip-month">Month</Label>
        <select
          id="slip-month"
          value={month}
          onChange={(event) => go({ month: event.target.value })}
          className={NATIVE_SELECT_CLASS}
        >
          {months.map((value) => (
            <option key={value} value={value}>
              {formatMonthLabel(value)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
