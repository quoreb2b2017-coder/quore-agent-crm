"use client";

import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";

export function ProductivityFilters({
  employees,
  employeeId,
}: {
  employees: { id: string; full_name: string; employee_code: string }[];
  employeeId: string | null;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card/90 p-4 sm:flex-row sm:items-end">
      <div className="grid min-w-0 flex-1 gap-2">
        <Label htmlFor="productivity-employee">Employee</Label>
        <select
          id="productivity-employee"
          value={employeeId ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            router.push(value ? `/admin/productivity?employee=${value}` : "/admin/productivity");
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
    </div>
  );
}
