"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { ExcelDownloadButton } from "@/components/activity/excel-download-button";
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

const DAYS_TYPING_DELAY_MS = 400;

type Span = "days" | "week" | "month";
type Filters = { span: Span; dayCount: string; date: string; year: string; monthIndex: string; person: string };

export function ActivityFilters({
  mode,
  days,
  month,
  date,
  employeeId,
  employees,
}: {
  mode: Span;
  days: number;
  month: string;
  /** Any day in the week, for the week range. */
  date: string;
  employeeId: string | null;
  employees: { id: string; full_name: string; employee_code: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filters, setFilters] = useState<Filters>({
    span: mode,
    dayCount: String(days),
    date,
    year: month.slice(0, 4),
    monthIndex: month.slice(5, 7) || "01",
    person: employeeId ?? "",
  });
  const typing = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(typing.current), []);

  function show(next: Filters) {
    const params = new URLSearchParams();
    params.set("mode", next.span);
    if (next.span === "month") params.set("month", `${next.year}-${next.monthIndex}`);
    else if (next.span === "week") params.set("date", next.date);
    else params.set("days", next.dayCount || "7");
    if (next.person) params.set("employee", next.person);
    startTransition(() => router.push(`/admin/activity?${params.toString()}`, { scroll: false }));
  }

  /** Every choice applies at once. Only the days box waits, so typing "30" is not two loads. */
  function change(patch: Partial<Filters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    window.clearTimeout(typing.current);
    if ("dayCount" in patch) {
      if (!next.dayCount) return;
      typing.current = window.setTimeout(() => show(next), DAYS_TYPING_DELAY_MS);
      return;
    }
    show(next);
  }

  const excelParams = new URLSearchParams({ mode, days: String(days), month, date });
  if (employeeId) excelParams.set("employee", employeeId);

  return (
    <div className="flex flex-col gap-3 border bg-muted px-3 py-2 sm:flex-row sm:flex-wrap sm:items-end">
      <label className="flex min-w-36 flex-col gap-1 text-xs font-medium text-muted-foreground">
        Range
        <select
          value={filters.span}
          onChange={(event) => change({ span: event.target.value as Span })}
          className={cn(NATIVE_SELECT_CLASS, "rounded-sm bg-card text-foreground")}
        >
          <option value="days">Last N days</option>
          <option value="week">Weekly</option>
          <option value="month">Monthly</option>
        </select>
      </label>
      {filters.span === "week" ? (
        <label className="flex w-44 flex-col gap-1 text-xs font-medium text-muted-foreground">
          Any day in the week
          <input
            type="date"
            value={filters.date}
            onChange={(event) => event.target.value && change({ date: event.target.value })}
            className={cn(NATIVE_SELECT_CLASS, "rounded-sm bg-card text-foreground")}
          />
        </label>
      ) : filters.span === "month" ? (
        <>
          <label className="flex w-28 flex-col gap-1 text-xs font-medium text-muted-foreground">
            Year
            <select
              value={filters.year}
              onChange={(event) => change({ year: event.target.value })}
              className={cn(NATIVE_SELECT_CLASS, "rounded-sm bg-card text-foreground")}
            >
              {yearChoices(filters.year).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-40 flex-col gap-1 text-xs font-medium text-muted-foreground">
            Month
            <select
              value={filters.monthIndex}
              onChange={(event) => change({ monthIndex: event.target.value })}
              className={cn(NATIVE_SELECT_CLASS, "rounded-sm bg-card text-foreground")}
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
            value={filters.dayCount}
            onChange={(event) => change({ dayCount: event.target.value })}
            className={cn(NATIVE_SELECT_CLASS, "rounded-sm bg-card text-foreground")}
          />
        </label>
      )}
      <label className="flex min-w-56 flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-80">
        Employee
        <select
          value={filters.person}
          onChange={(event) => change({ person: event.target.value })}
          className={cn(NATIVE_SELECT_CLASS, "rounded-sm bg-card text-foreground")}
        >
          <option value="">All employees</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.full_name} ({employee.employee_code})
            </option>
          ))}
        </select>
      </label>
      {isPending ? (
        <Loader2 className="mb-2 size-4 animate-spin text-primary" aria-label="Loading" />
      ) : null}
      <ExcelDownloadButton
        href={`/api/activity/excel?${excelParams.toString()}`}
        className="rounded-sm bg-card sm:ml-auto"
      />
    </div>
  );
}

function yearChoices(selected: string) {
  const current = new Date().getFullYear();
  const years = [current - 1, current, current + 1].map(String);
  if (!years.includes(selected)) years.unshift(selected);
  return years;
}
