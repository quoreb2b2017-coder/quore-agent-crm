"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  greetingForNow,
  INDIA_TIME_ZONE,
  US_TIME_ZONE,
  shiftWindowLabel,
} from "@/lib/format";
import { shiftCountdown } from "@/lib/shift";
import { formatMinutesLabel, getWorkSettings, shiftLengthMinutes, timeZoneShort } from "@/lib/work-settings";

function formatTime(now: Date, timeZone: string, withSeconds = true) {
  return now.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
    ...(withSeconds ? { second: "2-digit" as const } : {}),
  });
}

function formatDate(now: Date, timeZone: string) {
  return now.toLocaleDateString("en-IN", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone,
  });
}

function useNow() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return now;
}

export function LiveTime({
  className,
  withDate = false,
  timeZone = INDIA_TIME_ZONE,
  label,
}: {
  className?: string;
  withDate?: boolean;
  timeZone?: string;
  label?: string;
}) {
  const now = useNow();
  const time = now ? formatTime(now, timeZone) : "--:--:--";
  const date = now ? formatDate(now, timeZone) : "";

  return (
    <time className={cn("tabular-nums", className)} dateTime={now?.toISOString()}>
      {label ? `${label} ` : null}
      {withDate && date ? `${date} · ${time}` : time}
    </time>
  );
}

export function DualOfficeClocks({
  className,
  stacked = false,
  cards = false,
  pills = false,
}: {
  className?: string;
  stacked?: boolean;
  cards?: boolean;
  pills?: boolean;
}) {
  const now = useNow();
  const shiftZone = getWorkSettings().timeZone;
  const shiftLabel = timeZoneShort(shiftZone);
  const india = now ? formatTime(now, shiftZone, !pills) : pills ? "--:--" : "--:--:--";
  const us = now ? formatTime(now, US_TIME_ZONE, !pills) : pills ? "--:--" : "--:--:--";

  async function copy(label: string, value: string) {
    if (!now) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} time copied`);
    } catch {
      toast.error("Could not copy time");
    }
  }

  if (pills) {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        <button
          type="button"
          onClick={() => copy(shiftLabel, `${india} ${shiftLabel}`)}
          disabled={!now}
          className="hidden items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-70 sm:inline-flex"
          title={`Copy ${shiftLabel} time`}
        >
          <span className="font-medium">{shiftLabel}</span>
          <span className="font-medium tabular-nums text-foreground">{india}</span>
        </button>
        <button
          type="button"
          onClick={() => copy("US", `${us} ET`)}
          disabled={!now}
          className="hidden items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-70 md:inline-flex"
          title="Copy US time"
        >
          <span className="font-medium">ET</span>
          <span className="font-medium tabular-nums text-foreground">{us}</span>
        </button>
      </div>
    );
  }

  if (cards) {
    return (
      <div className={cn("grid grid-cols-2 gap-3", className)}>
        <button
          type="button"
          onClick={() => copy(shiftLabel, `${india} ${shiftLabel}`)}
          disabled={!now}
          className="rounded-xl border border-white/10 bg-white/8 p-3 text-left transition hover:-translate-y-0.5 hover:bg-white/14 hover:shadow-lg disabled:hover:translate-y-0"
        >
          <p className="text-[10px] font-medium tracking-wide text-white/55 uppercase">Shift · {shiftLabel}</p>
          <p className="mt-1 text-lg font-semibold tracking-tight tabular-nums">{india}</p>
        </button>
        <button
          type="button"
          onClick={() => copy("US", `${us} ET`)}
          disabled={!now}
          className="rounded-xl border border-white/10 bg-white/8 p-3 text-left transition hover:-translate-y-0.5 hover:bg-white/14 hover:shadow-lg disabled:hover:translate-y-0"
        >
          <p className="text-[10px] font-medium tracking-wide text-white/55 uppercase">US · ET</p>
          <p className="mt-1 text-lg font-semibold tracking-tight tabular-nums">{us}</p>
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        stacked ? "flex flex-col gap-1.5" : "flex flex-wrap items-center gap-x-3 gap-y-1",
        className
      )}
    >
      {stacked ? (
        <p className="text-xs opacity-80">{now ? formatDate(now, getWorkSettings().timeZone) : "—"}</p>
      ) : null}
      <p className="tabular-nums">
        <span className="font-medium">{timeZoneShort(getWorkSettings().timeZone)}</span> {india}
      </p>
      {stacked ? null : <span className="hidden text-current/40 sm:inline">·</span>}
      <p className="tabular-nums">
        <span className="font-medium">US</span> {us} ET
      </p>
    </div>
  );
}

export function ShiftCountdown({ className }: { className?: string }) {
  const now = useNow();
  const { open, minutesRemaining } = now
    ? shiftCountdown(now)
    : { open: false, minutesRemaining: 0 };
  const hours = Math.floor(minutesRemaining / 60);
  const minutes = minutesRemaining % 60;
  const until = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  const shiftMinutes = shiftLengthMinutes();
  const pct = !now
    ? 0
    : open
      ? Math.min(100, ((shiftMinutes - minutesRemaining) / shiftMinutes) * 100)
      : 0;

  return (
    <div className={cn("rounded-xl border border-white/10 bg-white/8 p-3", className)}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-white/70">Shift hours</span>
        <span className="font-semibold text-white">{shiftWindowLabel(now ?? undefined)}</span>
      </div>
      <p className="mt-1.5 text-xs text-white/60">
        {!now
          ? shiftWindowLabel()
          : open
            ? `Shift is open — ${shiftWindowLabel(now)} · ${until} left`
            : `Shift starts in ${until} (${formatMinutesLabel(getWorkSettings().loginMinutes)})`}
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
        <div
          className={cn("h-full rounded-full transition-all duration-500", open ? "bg-success" : "bg-white")}
          style={{ width: `${Math.max(open ? 8 : now ? 6 : 0, pct)}%` }}
        />
      </div>
    </div>
  );
}

export function ClientGreeting({ className }: { className?: string }) {
  const [greeting, setGreeting] = useState("Welcome");

  useEffect(() => {
    setGreeting(greetingForNow());
  }, []);

  return <span className={className}>{greeting}</span>;
}
