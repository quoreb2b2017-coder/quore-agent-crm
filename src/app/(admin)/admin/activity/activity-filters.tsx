"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import { cn } from "@/lib/utils";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function ActivityFilters({
  mode,
  days,
  month,
  employeeId,
  employees,
}: {
  mode: "days" | "month";
  days: number;
  month: string;
  employeeId: string | null;
  employees: { id: string; full_name: string; employee_code: string }[];
}) {
  const router = useRouter();
  const [span, setSpan] = useState(mode);
  const [dayCount, setDayCount] = useState(String(days));
  const [year, setYear] = useState(month.slice(0, 4));
  const [monthIndex, setMonthIndex] = useState(month.slice(5, 7) || "01");
  const [person, setPerson] = useState(employeeId ?? "");

  function show() {
    const params = new URLSearchParams();
    params.set("mode", span);
    if (span === "month") params.set("month", `${year}-${monthIndex}`);
    else params.set("days", dayCount || "7");
    if (person) params.set("employee", person);
    router.push(`/admin/activity?${params.toString()}`);
  }

  const pdf = new URLSearchParams();
  pdf.set("mode", mode);
  pdf.set("days", String(days));
  pdf.set("month", month);
  if (employeeId) pdf.set("employee", employeeId);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end">
      <label className="flex min-w-36 flex-col gap-1 text-xs font-medium text-muted-foreground">
        Range
        <select
          value={span}
          onChange={(event) => setSpan(event.target.value === "month" ? "month" : "days")}
          className={cn(NATIVE_SELECT_CLASS)}
        >
          <option value="days">Last N days</option>
          <option value="month">Month</option>
        </select>
      </label>
      {span === "month" ? (
        <>
          <label className="flex w-28 flex-col gap-1 text-xs font-medium text-muted-foreground">
            Year
            <select value={year} onChange={(event) => setYear(event.target.value)} className={cn(NATIVE_SELECT_CLASS)}>
              {yearChoices(year).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-40 flex-col gap-1 text-xs font-medium text-muted-foreground">
            Month
            <select
              value={monthIndex}
              onChange={(event) => setMonthIndex(event.target.value)}
              className={cn(NATIVE_SELECT_CLASS)}
            >
              {MONTHS.map((name, index) => {
                const value = String(index + 1).padStart(2, "0");
                return (
                  <option key={value} value={value}>
                    {name}
                  </option>
                );
              })}
            </select>
          </label>
        </>
      ) : (
        <label className="flex w-28 flex-col gap-1 text-xs font-medium text-muted-foreground">
          Days
          <input
            type="number"
            min={1}
            max={90}
            value={dayCount}
            onChange={(event) => setDayCount(event.target.value)}
            className={cn(NATIVE_SELECT_CLASS)}
          />
        </label>
      )}
      <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
        Employee
        <select value={person} onChange={(event) => setPerson(event.target.value)} className={cn(NATIVE_SELECT_CLASS)}>
          <option value="">All employees</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.full_name} ({employee.employee_code})
            </option>
          ))}
        </select>
      </label>
      <Button type="button" onClick={show}>
        Show
      </Button>
      <Button type="button" variant="outline" asChild>
        <a href={`/api/activity/pdf?${pdf.toString()}`}>
          <FileDown className="size-4" />
          Download PDF
        </a>
      </Button>
    </div>
  );
}

function yearChoices(selected: string) {
  const current = new Date().getFullYear();
  const years = [current - 1, current, current + 1].map(String);
  if (!years.includes(selected)) years.unshift(selected);
  return years;
}
