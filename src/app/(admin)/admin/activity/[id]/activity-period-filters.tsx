"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ExcelDownloadButton } from "@/components/activity/excel-download-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { activityPeriodParams, MAX_ACTIVITY_DAYS, type ActivityView } from "@/lib/activity-period";
import { cn } from "@/lib/utils";

const VIEWS: { id: ActivityView; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "days", label: "Last N days" },
];

const DAYS_TYPING_DELAY_MS = 400;

type Choice = { view: ActivityView; date: string; month: string; dayCount: string };

export function ActivityPeriodFilters({
  employeeId,
  view,
  date,
  month,
  dayCount,
  today,
}: {
  employeeId: string;
  view: ActivityView;
  date: string;
  month: string;
  dayCount: number;
  today: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [choice, setChoice] = useState<Choice>({ view, date, month, dayCount: String(dayCount) });
  const typing = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(typing.current), []);

  function show(next: Choice) {
    const params = activityPeriodParams(next);
    startTransition(() => router.push(`/admin/activity/${employeeId}?${params.toString()}`, { scroll: false }));
  }

  /** Every choice applies at once. Only the number box waits, so typing "30" is not two loads. */
  function change(patch: Partial<Choice>) {
    const next = { ...choice, ...patch };
    setChoice(next);
    window.clearTimeout(typing.current);
    if ("dayCount" in patch) {
      if (!next.dayCount) return;
      typing.current = window.setTimeout(() => show(next), DAYS_TYPING_DELAY_MS);
      return;
    }
    show(next);
  }

  const excelParams = activityPeriodParams({ view, date, month, dayCount });
  excelParams.set("employee", employeeId);

  return (
    <div className="flex flex-wrap items-end gap-3 border bg-muted px-3 py-2">
      <div className="grid gap-1">
        <Label className="text-xs">View</Label>
        <div className="inline-flex divide-x rounded-sm border bg-card">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={choice.view === item.id}
              onClick={() => change({ view: item.id })}
              className={cn(
                "h-8 px-3 text-xs font-semibold transition-colors",
                choice.view === item.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {choice.view === "daily" || choice.view === "weekly" ? (
        <div className="grid gap-1">
          <Label htmlFor="activity-date" className="text-xs">
            {choice.view === "daily" ? "Date" : "Any day in the week"}
          </Label>
          <Input
            id="activity-date"
            type="date"
            max={today}
            value={choice.date}
            onChange={(event) => event.target.value && change({ date: event.target.value })}
            className="w-40 rounded-sm bg-card"
          />
        </div>
      ) : null}
      {choice.view === "monthly" ? (
        <div className="grid gap-1">
          <Label htmlFor="activity-month" className="text-xs">
            Month
          </Label>
          <Input
            id="activity-month"
            type="month"
            max={today.slice(0, 7)}
            value={choice.month}
            onChange={(event) => event.target.value && change({ month: event.target.value })}
            className="w-40 rounded-sm bg-card"
          />
        </div>
      ) : null}
      {choice.view === "days" ? (
        <div className="grid gap-1">
          <Label htmlFor="activity-days" className="text-xs">
            Number of days
          </Label>
          <Input
            id="activity-days"
            type="number"
            min={1}
            max={MAX_ACTIVITY_DAYS}
            value={choice.dayCount}
            onChange={(event) => change({ dayCount: event.target.value })}
            className="w-24 rounded-sm bg-card"
          />
        </div>
      ) : null}
      {isPending ? <Loader2 className="mb-2 size-4 animate-spin text-primary" aria-label="Loading" /> : null}
      <ExcelDownloadButton
        href={`/api/activity/excel?${excelParams.toString()}`}
        className="rounded-sm bg-card sm:ml-auto"
      />
    </div>
  );
}
