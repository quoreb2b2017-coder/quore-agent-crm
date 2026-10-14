"use client";

import { useEffect, useState } from "react";
import { Bath, Coffee, LogIn, LogOut, Radio, Users } from "lucide-react";
import { formatTimeInZone } from "@/lib/format";
import { formatClock } from "@/lib/live-time";
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
  break: "bg-warning/15 text-warning-foreground",
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

function liveDetail(event: ShiftActivityEvent, now: number | null) {
  if (event.detail !== "In progress" || now == null) return event.detail;
  const seconds = Math.max(0, Math.floor((now - new Date(event.at).getTime()) / 1000));
  return `In progress · ${formatClock(seconds)}`;
}

export function MyActivityLog({ days, embedded = false }: { days: ActivityDayLog[]; embedded?: boolean }) {
  const [active, setActive] = useState(days[0]?.date ?? null);
  const [now, setNow] = useState<number | null>(null);
  const selected = days.find((day) => day.date === active) ?? days[0] ?? null;
  const live = selected?.events.some((event) => event.detail === "In progress") ?? false;
  const zone = getWorkSettings().timeZone;

  useEffect(() => {
    if (!live) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [live, selected?.date]);

  if (!selected) return null;
  const counts = dayCounts(selected.events);

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden bg-card",
        embedded ? "h-auto max-h-[32rem] min-h-0 rounded-none border-0" : "rounded-2xl border"
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
            <h2 className="text-sm font-semibold">Your activity</h2>
            <p className={cn("text-xs", embedded ? "text-white/70" : "text-muted-foreground")}>
              Only your log · last {days.length} days
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
                "flex w-[4.25rem] shrink-0 flex-col items-center rounded-xl border px-1 py-1.5",
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

      <div className="grid grid-cols-2 gap-2 px-4 py-3 sm:grid-cols-4 sm:px-5">
        <Count label="Logins" value={counts.logins} />
        <Count label="Breaks" value={counts.breaks} />
        <Count label="Washroom" value={counts.washrooms} />
        <Count label="Meetings" value={counts.meetings} />
      </div>

      <div className={cn("border-t px-4 py-4 sm:px-5", embedded && "min-h-0 flex-1 overflow-y-auto")}>
        {selected.events.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {selected.weekend ? "Week off. No activity this shift." : "No activity this shift."}
          </p>
        ) : (
          <ol>
            {selected.events.map((event, index) => {
              const Icon = toneIcon[event.tone];
              const detail = liveDetail(event, now);
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
                            running ? "font-medium text-warning-foreground" : "text-muted-foreground"
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
    <div className="rounded-xl bg-muted/50 px-3 py-2">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
