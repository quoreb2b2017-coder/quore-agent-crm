"use client";

import { useEffect, useState } from "react";
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
  search,
}: {
  canPickEmployee: boolean;
  employees: { id: string; full_name: string; employee_code: string }[];
  view: AttendanceView;
  employeeId: string | null;
  date: string;
  month: string;
  year: string;
  search: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(search);

  useEffect(() => {
    setDraft(search);
  }, [search]);

  useEffect(() => {
    const next = draft.trim();
    if (next === search) return;
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams();
      params.set("view", view);
      if (employeeId) params.set("employee", employeeId);
      if (view === "daily") params.set("date", date);
      if (view === "monthly") params.set("month", month);
      if (view === "yearly") params.set("year", year);
      if (next) params.set("q", next);
      router.push(`/admin/attendance?${params.toString()}`);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [draft, search, view, employeeId, date, month, year, router]);

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
    if (search.trim()) params.set("q", search.trim());
    router.push(`/admin/attendance?${params.toString()}`);
  }

  const needle = draft.trim().toLowerCase();
  const listed = needle
    ? employees.filter(
        (employee) =>
          employee.id === employeeId ||
          employee.full_name.toLowerCase().includes(needle) ||
          employee.employee_code.toLowerCase().includes(needle)
      )
    : employees;

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
              {listed.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name} ({employee.employee_code})
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {canPickEmployee ? (
          <div className="grid min-w-[12rem] flex-1 gap-1.5">
            <Label htmlFor="attendance-search">Search</Label>
            <input
              id="attendance-search"
              type="search"
              value={draft}
              placeholder="Name or code"
              onChange={(e) => setDraft(e.target.value)}
              className={NATIVE_SELECT_CLASS}
            />
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
        Pick a period, search a name, or click a name. That opens the same record as the employee list.
      </p>
    </div>
  );
}
