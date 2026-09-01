"use client";

import { useRouter } from "next/navigation";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import { cn } from "@/lib/utils";

export function EmployeeWatchSelect({
  employees,
  employeeId,
}: {
  employees: { id: string; full_name: string; employee_code: string }[];
  employeeId: string | null;
}) {
  const router = useRouter();

  return (
    <select
      id="watch-employee"
      aria-label="Select employee"
      value={employeeId ?? ""}
      onChange={(event) => {
        const value = event.target.value;
        router.push(value ? `/admin/dashboard?employee=${value}` : "/admin/dashboard");
      }}
      className={cn(NATIVE_SELECT_CLASS, "border-white/25 bg-white text-foreground shadow-sm")}
    >
      <option value="">All employees</option>
      {employees.map((employee) => (
        <option key={employee.id} value={employee.id}>
          {employee.full_name} ({employee.employee_code})
        </option>
      ))}
    </select>
  );
}
