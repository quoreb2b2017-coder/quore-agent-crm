import Link from "next/link";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { eachDateInclusive, formatDuration, isWeekendIso, todayIso, weekdayIndexIst, weekdayShortIst } from "@/lib/format";
import { PRODUCTIVE_HOURS_LABEL, PRODUCTIVE_SECONDS } from "@/lib/shift";
import type { ProductivityDay } from "@/lib/queries/productivity-report";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function leftSeconds(worked: number) {
  return Math.max(0, PRODUCTIVE_SECONDS - worked);
}

export function MonthCalendar({
  title,
  start,
  end,
  days,
  trackingStart,
  today = todayIso(),
  prevHref,
  nextHref,
}: {
  title: string;
  start: string;
  end: string;
  days: ProductivityDay[];
  trackingStart: string;
  today?: string;
  prevHref?: string;
  nextHref?: string;
}) {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const dates = eachDateInclusive(start, end);
  const leadingBlanks = (weekdayIndexIst(start) + 6) % 7;
  const counted = days.filter(
    (day) => day.date <= today && day.status !== "off" && day.status !== "upcoming"
  );
  const worked = counted.reduce((sum, day) => sum + day.productiveSeconds, 0);
  const missing = days
    .filter((day) => day.date < today && day.status !== "off" && day.status !== "upcoming")
    .reduce((sum, day) => sum + leftSeconds(day.productiveSeconds), 0);
  const target = counted.length * PRODUCTIVE_SECONDS;

  return (
    <section className="-mx-4 flex w-[calc(100%+2rem)] flex-col gap-2 md:-mx-8 md:w-[calc(100%+4rem)]">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {prevHref ? <MonthLink href={prevHref} label="Previous month" direction="prev" /> : null}
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{title}</h3>
            <p className="truncate text-[11px] text-muted-foreground">
              {formatDuration(worked)} worked
              {missing > 0 ? ` · ${formatDuration(missing)} short` : ""}
            </p>
          </div>
          {nextHref ? <MonthLink href={nextHref} label="Next month" direction="next" /> : null}
        </div>
        <div className="hidden items-center gap-2.5 text-[10px] text-muted-foreground sm:flex">
          <Legend dot="bg-success" label="On target" />
          <Legend dot="bg-warning" label="Late" />
          <Legend dot="bg-destructive/70" label="Short" />
          <Legend dot="bg-muted-foreground/30" label="Off" />
        </div>
      </div>

      <div className="grid items-stretch gap-2 md:grid-cols-2">
        <ProductiveGraph days={counted} worked={worked} target={target} />
        <div className="min-w-0 rounded-xl border bg-card p-3">
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((label, index) => (
              <div key={`${label}-${index}`} className="pb-0.5 text-center text-[10px] font-medium text-muted-foreground">
                {label}
              </div>
            ))}
            {Array.from({ length: leadingBlanks }, (_, index) => (
              <div key={`blank-${index}`} />
            ))}
            {dates.map((date) => {
              const day = byDate.get(date);
              const weekend = isWeekendIso(date);
              const untracked = !weekend && date < trackingStart;
              return (
                <CalendarDay
                  key={date}
                  date={date}
                  today={today}
                  weekend={weekend}
                  untracked={untracked}
                  day={day}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductiveGraph({
  days,
  worked,
  target,
}: {
  days: ProductivityDay[];
  worked: number;
  target: number;
}) {
  const peak = Math.max(PRODUCTIVE_SECONDS, ...days.map((day) => day.productiveSeconds), 1);
  const targetPct = (PRODUCTIVE_SECONDS / peak) * 100;
  const monthPct = target > 0 ? Math.min(100, Math.round((worked / target) * 100)) : 0;

  return (
    <aside className="flex h-full flex-col justify-between gap-3 rounded-xl border bg-card p-3">
      <div>
        <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Productive</p>
        <p className="mt-0.5 text-xl font-semibold tracking-tight tabular-nums">{formatDuration(worked)}</p>
        <p className="text-[11px] text-muted-foreground">
          {target > 0 ? `${monthPct}% of ${formatDuration(target)}` : "No working days yet"}
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
          <div className="h-full rounded-full bg-primary" style={{ width: `${monthPct}%` }} />
        </div>
      </div>

      {days.length === 0 ? (
        <p className="text-xs text-muted-foreground">No productive days yet.</p>
      ) : (
        <div className="relative flex min-h-36 flex-1 items-end gap-0.5">
          {days.map((day) => {
            const height = Math.max(4, Math.round((day.productiveSeconds / peak) * 100));
            const tone =
              day.status === "met"
                ? "bg-success"
                : day.status === "in_progress"
                  ? "bg-warning"
                  : "bg-destructive/70";
            return (
              <div key={day.date} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={barTitle(day)}>
                <div className={cn("w-full rounded-t-sm", tone)} style={{ height: `${height}%` }} />
              </div>
            );
          })}
          <div
            className="pointer-events-none absolute right-0 left-0 z-10 border-t border-dashed border-foreground/35"
            style={{ bottom: `${targetPct}%` }}
          />
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">Daily bars · dashed line is {PRODUCTIVE_HOURS_LABEL}</p>
    </aside>
  );
}

function barTitle(day: ProductivityDay) {
  const left = leftSeconds(day.productiveSeconds);
  const gap = left > 0 ? `, ${formatDuration(left)} ${day.status === "in_progress" ? "left" : "short"}` : ", on target";
  return `${Number(day.date.slice(8, 10))}: ${formatDuration(day.productiveSeconds)}${gap}`;
}

function MonthLink({ href, label, direction }: { href: string; label: string; direction: "prev" | "next" }) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
    >
      <Icon className="size-3.5" />
    </Link>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("size-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}

function CalendarDay({
  date,
  today,
  weekend,
  untracked,
  day,
}: {
  date: string;
  today: string;
  weekend: boolean;
  untracked: boolean;
  day?: ProductivityDay;
}) {
  const dayNumber = Number(date.slice(8, 10));
  const isToday = date === today;
  const late = day?.attendanceStatus === "LATE";
  const off = weekend || untracked || day?.status === "off";
  const worked = day?.productiveSeconds ?? 0;
  const left = leftSeconds(worked);
  const showTime = !off && day && (day.status === "met" || day.status === "short" || day.status === "in_progress");
  const label = weekend
    ? "Off"
    : untracked
      ? "—"
      : day?.offStatus === "HOLIDAY"
        ? "Holiday"
        : day?.offStatus === "ON_LEAVE"
          ? "Leave"
          : day?.offStatus === "WEEK_OFF"
            ? "Off"
            : "—";

  return (
    <div
      className={cn(
        "flex min-h-11 flex-col justify-between rounded-md border px-1.5 py-1",
        isToday && "ring-1 ring-primary",
        off && "border-transparent bg-muted/50 text-muted-foreground",
        !off && day?.status === "met" && "border-success/25 bg-success/10",
        !off && day?.status === "short" && "border-destructive/20 bg-destructive/[0.04]",
        !off && day?.status === "in_progress" && "border-warning/35 bg-warning/10",
        !off && (day?.status === "upcoming" || !day) && "border-dashed bg-background"
      )}
      title={
        showTime
          ? `${weekdayShortIst(date)} ${dayNumber}: ${formatDuration(worked)}${left > 0 ? `, ${formatDuration(left)} ${day?.status === "in_progress" ? "left" : "short"}` : ""}`
          : `${weekdayShortIst(date)} ${dayNumber}`
      }
    >
        <div className="flex items-center justify-between gap-0.5">
        <span className={cn("text-[11px] font-semibold tabular-nums leading-none", isToday && "text-primary")}>
          {dayNumber}
        </span>
        <span className="flex items-center gap-0.5">
          {late && !off ? <span className="size-1.5 shrink-0 rounded-full bg-warning" title="Late" /> : null}
          {!off && day?.status === "met" ? (
            <Check className="size-3 shrink-0 text-success" strokeWidth={3} aria-label="Target met" />
          ) : null}
        </span>
      </div>
      {showTime ? (
        <span
          className={cn(
            "truncate text-[10px] leading-none font-medium tabular-nums",
            day?.status === "met" ? "text-success" : day?.status === "in_progress" ? "text-foreground" : "text-destructive"
          )}
        >
          {formatDuration(worked)}
        </span>
      ) : (
        <span className="truncate text-[10px] leading-none text-muted-foreground">
          {day?.status === "upcoming" ? "" : label}
        </span>
      )}
    </div>
  );
}
