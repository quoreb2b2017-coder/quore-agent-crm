import { CheckCircle2, CircleDashed, Clock3, MinusCircle, XCircle } from "lucide-react";
import { formatDuration } from "@/lib/format";
import { PRODUCTIVE_SECONDS } from "@/lib/shift";
import type { DayStatus } from "@/lib/queries/productivity-report";
import { cn } from "@/lib/utils";

const pillStyles = {
  success: "bg-success/10 text-success ring-success/25",
  danger: "bg-destructive/10 text-destructive ring-destructive/20",
  warning: "bg-warning/15 text-warning-foreground ring-warning/30",
  muted: "bg-muted text-muted-foreground ring-border",
} as const;

export function Pill({
  tone,
  icon: Icon,
  children,
}: {
  tone: keyof typeof pillStyles;
  icon: typeof CheckCircle2;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ring-1 ring-inset",
        pillStyles[tone]
      )}
    >
      <Icon className="size-3.5" />
      {children}
    </span>
  );
}

export function TargetBar({ seconds, target = PRODUCTIVE_SECONDS }: { seconds: number; target?: number }) {
  const pct = target > 0 ? Math.min(100, (seconds / target) * 100) : 0;
  const met = seconds >= target && target > 0;
  return (
    <div className="h-1.5 w-full max-w-[9rem] overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-700 ease-out",
          met ? "bg-success" : pct >= 60 ? "bg-warning" : "bg-destructive/70"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function DayStatusPill({
  status,
  productiveSeconds,
  offStatus,
}: {
  status: DayStatus;
  productiveSeconds: number;
  offStatus?: string | null;
}) {
  const left = Math.max(0, PRODUCTIVE_SECONDS - productiveSeconds);
  if (status === "met") return null;
  if (status === "in_progress") {
    return (
      <Pill tone="warning" icon={Clock3}>
        {formatDuration(left)} to go
      </Pill>
    );
  }
  if (status === "short") {
    return (
      <Pill tone="danger" icon={XCircle}>
        {formatDuration(left)} short
      </Pill>
    );
  }
  if (status === "off") {
    return (
      <Pill tone="muted" icon={MinusCircle}>
        {offStatus === "HOLIDAY" ? "Holiday" : offStatus === "WEEK_OFF" ? "Week off" : "On leave"}
      </Pill>
    );
  }
  return (
    <Pill tone="muted" icon={CircleDashed}>
      Upcoming
    </Pill>
  );
}

export function BalancePill({ seconds, hasFinishedDays }: { seconds: number; hasFinishedDays: boolean }) {
  if (!hasFinishedDays) return <span className="text-xs text-muted-foreground">No finished days yet</span>;
  if (seconds >= 0) {
    return (
      <Pill tone="success" icon={CheckCircle2}>
        {seconds >= 60 ? `${formatDuration(seconds)} ahead` : "On target"}
      </Pill>
    );
  }
  return (
    <Pill tone="danger" icon={XCircle}>
      {formatDuration(-seconds)} short
    </Pill>
  );
}

export function PeriodEndCell({
  productiveSeconds,
  periodTargetSeconds,
  remainingDays,
  neededPerDaySeconds,
}: {
  productiveSeconds: number;
  periodTargetSeconds: number;
  remainingDays: number;
  neededPerDaySeconds: number;
}) {
  if (periodTargetSeconds === 0) return <span className="text-xs text-muted-foreground">No working days</span>;
  if (remainingDays === 0) {
    const gap = periodTargetSeconds - productiveSeconds;
    return gap <= 0 ? (
      <Pill tone="success" icon={CheckCircle2}>
        Completed
      </Pill>
    ) : (
      <Pill tone="danger" icon={XCircle}>
        Ended {formatDuration(gap)} short
      </Pill>
    );
  }
  if (neededPerDaySeconds === 0) {
    return (
      <Pill tone="success" icon={CheckCircle2}>
        Target secured
      </Pill>
    );
  }
  const hard = neededPerDaySeconds > PRODUCTIVE_SECONDS;
  return (
    <div className="flex flex-col gap-0.5">
      <span className={cn("text-sm font-semibold tabular-nums", hard ? "text-destructive" : "text-foreground")}>
        {formatDuration(neededPerDaySeconds)}/day needed
      </span>
      <span className="text-[11px] text-muted-foreground">
        {remainingDays} working day{remainingDays === 1 ? "" : "s"} left
        {hard ? " · above daily target" : ""}
      </span>
    </div>
  );
}

export function StatusLegend() {
  const items = [
    { label: "In progress", className: "bg-warning" },
    { label: "Short", className: "bg-destructive/70" },
    { label: "Off · not counted", className: "bg-muted-foreground/30" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", item.className)} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

const heatStyles: Record<DayStatus | "weekend", string> = {
  met: "border-success/35 bg-success/10",
  short: "border-destructive/25 bg-destructive/[0.06]",
  in_progress: "border-warning/40 bg-warning/10",
  upcoming: "border-dashed bg-background",
  off: "heat-off bg-muted/40",
  weekend: "heat-off bg-muted/40",
};

export function DayHeatCell({
  dayOfMonth,
  weekdayLabel,
  status,
  productiveSeconds,
  offLabel,
}: {
  dayOfMonth: number;
  weekdayLabel: string;
  status: DayStatus | "weekend";
  productiveSeconds: number;
  offLabel?: string;
}) {
  const showHours = status === "met" || status === "short" || status === "in_progress";
  return (
    <div
      className={cn("heat-cell flex min-h-[5.25rem] flex-col justify-between rounded-xl border p-2.5", heatStyles[status])}
      title={`${weekdayLabel} ${dayOfMonth}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold tabular-nums">{dayOfMonth}</span>
        {status === "met" ? <CheckCircle2 className="size-4 text-success" /> : null}
        {status === "in_progress" ? <Clock3 className="size-3.5 text-warning-foreground" /> : null}
        {status === "short" ? <XCircle className="size-3.5 text-destructive" /> : null}
      </div>
      {showHours ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold tabular-nums">{formatDuration(productiveSeconds)}</span>
          <TargetBar seconds={productiveSeconds} />
        </div>
      ) : (
        <span className="text-[11px] text-muted-foreground">
          {status === "upcoming" ? "Upcoming" : (offLabel ?? "Off")}
        </span>
      )}
    </div>
  );
}
