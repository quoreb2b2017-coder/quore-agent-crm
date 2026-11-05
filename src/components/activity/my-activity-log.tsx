"use client";

import { useState } from "react";
import { Bath, Coffee, LogIn, LogOut, Radio, Users } from "lucide-react";
import { ActivityEventCells, eventExcessSeconds } from "@/components/activity/activity-feed";
import { SheetKpi } from "@/components/dashboard/sheet-kpi";
import { useLiveNowMs } from "@/components/layout/trusted-clock";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatExcess, formatTimeInZone } from "@/lib/format";
import { activityDetail } from "@/lib/activity-detail";
import { sheetHeadClassName, sheetRowClassName } from "@/lib/sheet-styles";
import type { ActivityDayLog, ActivityTone, ShiftActivityEvent } from "@/lib/queries/shift-activity";
import { getWorkSettings } from "@/lib/work-settings";
import { cn } from "@/lib/utils";

const toneIcon = {
  login: LogIn,
  logout: LogOut,
  break: Coffee,
  washroom: Bath,
  meeting: Users,
} as const;

const toneClass: Record<ActivityTone, string> = {
  login: "bg-success/15 text-success",
  logout: "bg-muted text-muted-foreground",
  break: "bg-warning/15 text-warning",
  washroom: "bg-info/15 text-info",
  meeting: "bg-primary/10 text-primary",
};

function dayCounts(events: ShiftActivityEvent[]) {
  return {
    logins: events.filter((event) => event.tone === "login").length,
    breaks: events.filter((event) => event.tone === "break" && event.label.endsWith("started")).length,
    washrooms: events.filter((event) => event.label === "Washroom").length,
    meetings: events.filter((event) => event.label === "Meeting requested").length,
  };
}

export function MyActivityLog({
  days,
  embedded = false,
  title = "Your activity",
  subtitle,
}: {
  days: ActivityDayLog[];
  embedded?: boolean;
  title?: string;
  subtitle?: string;
}) {
  const [active, setActive] = useState(days[0]?.date ?? null);
  const selected = days.find((day) => day.date === active) ?? days[0] ?? null;
  const live = selected?.events.some((event) => event.detail === "In progress") ?? false;
  const now = useLiveNowMs(live);
  const zone = getWorkSettings().timeZone;

  if (!selected) return null;
  const counts = dayCounts(selected.events);

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden bg-card",
        embedded ? "h-auto max-h-[32rem] min-h-0 rounded-none border-0" : "border"
      )}
    >
      <div
        className={cn(
          "flex shrink-0 flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5",
          embedded ? "hours-card-head" : "border-b"
        )}
      >
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex size-8 items-center justify-center rounded-xl",
              embedded ? "bg-white/15 text-white" : "bg-primary/10 text-primary"
            )}
          >
            <Radio className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className={cn("text-xs", embedded ? "text-white/70" : "text-muted-foreground")}>
              {subtitle ?? `Only your log · last ${days.length} days`}
            </p>
          </div>
        </div>
        <p className={cn("text-xs font-medium", embedded ? "text-white/80" : "text-muted-foreground")}>
          {selected.label}
        </p>
      </div>

      <div className="flex shrink-0 gap-1.5 overflow-x-auto overflow-y-hidden border-b px-4 py-3 sm:px-5">
        {days.map((day) => {
          const chosen = day.date === selected.date;
          return (
            <button
              key={day.date}
              type="button"
              onClick={() => setActive(day.date)}
              className={cn(
                "flex w-[4.25rem] shrink-0 flex-col items-center rounded-sm border px-1 py-1.5",
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
                  day.events.length > 0 ? "bg-success" : "bg-border"
                )}
                aria-hidden
              />
            </button>
          );
        })}
      </div>

      {embedded ? (
        <div className="grid grid-cols-2 gap-2 px-4 py-3 sm:grid-cols-4 sm:px-5">
          <Count label="Logins" value={counts.logins} />
          <Count label="Breaks" value={counts.breaks} />
          <Count label="Washroom" value={counts.washrooms} />
          <Count label="Meetings" value={counts.meetings} />
        </div>
      ) : (
        <dl className="grid grid-cols-2 border-b xl:grid-cols-4">
          <SheetKpi label="Logins" value={counts.logins} valueClassName="text-success" />
          <SheetKpi label="Breaks" value={counts.breaks} valueClassName="text-warning" />
          <SheetKpi label="Washroom" value={counts.washrooms} valueClassName="text-info" />
          <SheetKpi label="Meetings" value={counts.meetings} />
        </dl>
      )}

      <div className={cn(embedded ? "min-h-0 flex-1 overflow-y-auto border-t px-4 py-4 sm:px-5" : "")}>
        {selected.events.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {selected.weekend ? "Week off. No activity this shift." : "No activity this shift."}
          </p>
        ) : !embedded ? (
          <Table className="border-separate border-spacing-0">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={sheetHeadClassName}>Time</TableHead>
                <TableHead className={sheetHeadClassName}>Event</TableHead>
                <TableHead className={cn(sheetHeadClassName, "border-r-0")}>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {selected.events.map((event) => (
                <TableRow key={event.id} className={sheetRowClassName}>
                  <ActivityEventCells event={event} now={now} zone={zone} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <ol>
            {selected.events.map((event, index) => {
              const Icon = toneIcon[event.tone];
              const excess = eventExcessSeconds(event, now);
              const detail = `${activityDetail(event, now) ?? ""}${excess > 0 ? ` · +${formatExcess(excess)} over` : ""}`;
              const running = event.detail === "In progress";
              const last = index === selected.events.length - 1;
              return (
                <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {last ? null : (
                    <span className="absolute top-8 bottom-0 left-[15px] w-px bg-border" aria-hidden />
                  )}
                  <span
                    className={cn(
                      "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full",
                      toneClass[event.tone]
                    )}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-3 pt-1">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{event.label}</p>
                      {detail ? (
                        <p
                          className={cn(
                            "text-xs tabular-nums",
                            excess > 0
                              ? "font-semibold text-destructive"
                              : running
                                ? "font-medium text-warning"
                                : "text-muted-foreground"
                          )}
                        >
                          {detail}
                        </p>
                      ) : null}
                    </div>
                    <time
                      className="shrink-0 text-xs text-muted-foreground tabular-nums"
                      dateTime={event.at}
                    >
                      {formatTimeInZone(event.at, zone)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-sm border bg-muted/50 px-3 py-1.5">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
