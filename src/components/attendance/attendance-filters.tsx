"use client";

import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import type { AttendanceView } from "@/lib/attendance-period";
import { yearOptions } from "@/lib/attendance-period";

const VIEWS: { id: AttendanceView; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
];

export function AttendanceFilters({
  canPickEmployee,
  employees,
  view,
  employeeId,
  date,
  month,
  year,
}: {
  canPickEmployee: boolean;
  employees: { id: string; full_name: string; employee_code: string }[];
  view: AttendanceView;
  employeeId: string | null;
  date: string;
  month: string;
  year: string;
}) {
  const router = useRouter();

  function go(next: {
    view?: AttendanceView;
    employeeId?: string | null;
    date?: string;
    month?: string;
    year?: string;
  }) {
    const params = new URLSearchParams();
    const nextView = next.view ?? view;
    params.set("view", nextView);
    const nextEmployee = next.employeeId === undefined ? employeeId : next.employeeId;
    if (nextEmployee) params.set("employee", nextEmployee);
    if (nextView === "daily") params.set("date", next.date ?? date);
    if (nextView === "monthly") params.set("month", next.month ?? month);
    if (nextView === "yearly") params.set("year", next.year ?? year);
    router.push(`/admin/attendance?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs">View</Label>
          <div className="inline-flex rounded-lg border p-0.5">
            {VIEWS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => go({ view: item.id })}
                className={cn(
                  "h-7 rounded-md px-3 text-sm font-medium transition",
                  view === item.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {canPickEmployee ? (
          <div className="grid min-w-[16rem] flex-1 gap-1.5">
            <Label htmlFor="attendance-employee">Employee</Label>
            <select
              id="attendance-employee"
              value={employeeId ?? "all"}
              onChange={(e) => go({ employeeId: e.target.value === "all" ? null : e.target.value })}
              className={NATIVE_SELECT_CLASS}
            >
              <option value="all">All employees</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name} ({employee.employee_code})
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {view === "daily" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="attendance-date">Date</Label>
            <input
              id="attendance-date"
              type="date"
              value={date}
              onChange={(e) => {
                if (e.target.value) go({ date: e.target.value });
              }}
              className={NATIVE_SELECT_CLASS}
            />
          </div>
        ) : null}

        {view === "monthly" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="attendance-month">Month</Label>
            <input
              id="attendance-month"
              type="month"
              value={month}
              onChange={(e) => {
                if (e.target.value) go({ month: e.target.value });
              }}
              className={NATIVE_SELECT_CLASS}
            />
          </div>
        ) : null}

        {view === "yearly" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="attendance-year">Year</Label>
            <select
              id="attendance-year"
              value={year}
              onChange={(e) => go({ year: e.target.value })}
              className={NATIVE_SELECT_CLASS}
            >
              {yearOptions().map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Pick a period. All employees shows the team report. Choose one person for their day-by-day record.
      </p>
    </div>
  );
}
