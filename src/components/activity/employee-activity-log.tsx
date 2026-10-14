"use client";

import { useState } from "react";
import { ActivityFeed } from "@/components/activity/activity-feed";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  loadEmployeeActivityLog,
  type ActivityDayLog,
} from "@/app/(admin)/admin/activity/actions";

export function EmployeeActivityLog({
  employeeId,
  fullName,
  employeeCode,
}: {
  employeeId: string;
  fullName: string;
  employeeCode: string;
}) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<ActivityDayLog[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setLoading(true);
    setError(null);
    const result = await loadEmployeeActivityLog(employeeId);
    setLoading(false);
    if ("error" in result) {
      setDays(null);
      setError(result.error);
      return;
    }
    setDays(result.days);
    setActive(result.days[0]?.date ?? null);
  }

  const selected = days?.find((day) => day.date === active) ?? null;

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="min-w-0 flex-1 rounded-md text-left transition hover:bg-muted/60"
        title="Open 12-day log"
      >
        <p className="truncate text-sm font-semibold">{fullName}</p>
        <p className="font-mono text-[11px] text-muted-foreground">{employeeCode}</p>
      </button>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{fullName}</SheetTitle>
            <SheetDescription>
              {employeeCode} · last 12 shifts. Pick a day to see that history.
            </SheetDescription>
          </SheetHeader>

          {loading ? <p className="px-6 py-8 text-sm text-muted-foreground">Loading log…</p> : null}
          {error ? <p className="px-6 py-8 text-sm text-destructive">{error}</p> : null}

          {days && selected ? (
            <>
              <div className="flex shrink-0 gap-1.5 overflow-x-auto overflow-y-hidden border-b px-4 py-3">
                {days.map((day) => {
                  const chosen = day.date === active;
                  return (
                    <button
                      key={day.date}
                      type="button"
                      onClick={() => setActive(day.date)}
                      className={cn(
                        "flex w-14 shrink-0 flex-col items-center rounded-lg border px-1 py-1.5",
                        chosen
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <span className="text-[10px] font-medium tracking-wide uppercase">{day.weekday}</span>
                      <span className="text-sm font-semibold tabular-nums">{day.day}</span>
                      <span
                        className={cn(
                          "mt-0.5 size-1.5 rounded-full",
                          day.events.length > 0 ? "bg-success" : "bg-transparent"
                        )}
                        aria-hidden
                      />
                    </button>
                  );
                })}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <p className="mb-3 text-sm font-medium">{selected.label}</p>
                {selected.events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {selected.weekend ? "Week off. No activity this shift." : "No activity this shift."}
                  </p>
                ) : (
                  <div className="rounded-xl border bg-card px-4 py-3">
                    <ActivityFeed events={selected.events} />
                  </div>
                )}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
