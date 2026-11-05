"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import {
  shiftProductivityPeriod,
  type ProductivityQuery,
  type ProductivityView,
} from "@/lib/productivity-period";

const VIEWS: { id: ProductivityView; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "custom", label: "Custom" },
];

type Next = {
  view?: ProductivityView;
  employeeId?: string | null;
  date?: string;
  month?: string;
  from?: string;
  to?: string;
};

export function ProductivityFilters({
  basePath,
  employees,
  query,
  today,
}: {
  basePath: string;
  employees: { id: string; full_name: string; employee_code: string }[];
  query: ProductivityQuery;
  today: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function go(next: Next) {
    const view = next.view ?? query.view;
    const params = new URLSearchParams({ view });
    const employee = next.employeeId === undefined ? query.employeeId : next.employeeId;
    if (employee) params.set("employee", employee);
    if (view === "daily" || view === "weekly") params.set("date", next.date ?? query.date);
    if (view === "monthly") params.set("month", next.month ?? query.month);
    if (view === "custom") {
      params.set("from", next.from ?? query.start);
      params.set("to", next.to ?? query.end);
    }
    startTransition(() => router.push(`${basePath}?${params.toString()}`, { scroll: false }));
  }

  const isCurrent =
    query.view === "monthly" ? query.month === today.slice(0, 7) : query.start <= today && today <= query.end;

  return (
    <div className="flex flex-col gap-2 border bg-muted px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex divide-x rounded-sm border bg-card">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={query.view === item.id}
              onClick={() => go({ view: item.id })}
              className={cn(
                "h-8 px-3 text-xs font-semibold transition-colors",
                query.view === item.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          {isPending ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="Previous period"
            onClick={() => go(shiftProductivityPeriod(query, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="flex min-w-[11rem] items-center justify-center gap-2 rounded-lg px-2 text-sm font-semibold">
            <CalendarDays className="size-4 text-muted-foreground" />
            {query.label}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="Next period"
            onClick={() => go(shiftProductivityPeriod(query, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            disabled={isCurrent}
            onClick={() =>
              go(
                query.view === "custom"
                  ? { view: "daily", date: today }
                  : { date: today, month: today.slice(0, 7) }
              )
            }
          >
            Today
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {employees.length > 0 ? (
          <div className="grid min-w-[14rem] flex-1 gap-1.5">
            <Label htmlFor="productivity-employee" className="text-xs">
              Employee
            </Label>
            <select
              id="productivity-employee"
              value={query.employeeId ?? ""}
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
        ) : null}

        {query.view === "daily" || query.view === "weekly" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="productivity-date" className="text-xs">
              {query.view === "daily" ? "Date" : "Any day in the week"}
            </Label>
            <input
              id="productivity-date"
              type="date"
              value={query.date}
              onChange={(event) => event.target.value && go({ date: event.target.value })}
              className={NATIVE_SELECT_CLASS}
            />
          </div>
        ) : null}

        {query.view === "monthly" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="productivity-month" className="text-xs">
              Month
            </Label>
            <input
              id="productivity-month"
              type="month"
              value={query.month}
              onChange={(event) => event.target.value && go({ month: event.target.value })}
              className={NATIVE_SELECT_CLASS}
            />
          </div>
        ) : null}

        {query.view === "custom" ? (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="productivity-from" className="text-xs">
                From
              </Label>
              <input
                id="productivity-from"
                type="date"
                value={query.start}
                max={query.end}
                onChange={(event) => event.target.value && go({ from: event.target.value })}
                className={NATIVE_SELECT_CLASS}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="productivity-to" className="text-xs">
                To
              </Label>
              <input
                id="productivity-to"
                type="date"
                value={query.end}
                min={query.start}
                onChange={(event) => event.target.value && go({ to: event.target.value })}
                className={NATIVE_SELECT_CLASS}
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
