"use client";

import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";

export function LeaveFilters({
  employees,
  employeeId,
}: {
  employees: { id: string; full_name: string; employee_code: string }[];
  employeeId: string | null;
}) {
  const router = useRouter();

  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor="leave-employee" className="text-xs">
        Employee
      </Label>
      <select
        id="leave-employee"
        value={employeeId ?? ""}
        onChange={(event) => {
          const value = event.target.value;
          router.push(value ? `/admin/leave?employee=${value}` : "/admin/leave");
        }}
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
  );
}
