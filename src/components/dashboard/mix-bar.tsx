import { cn } from "@/lib/utils";

export type MixSegment = {
  label: string;
  value: number;
  barClass: string;
  dotClass: string;
};

export function MixBar({ segments }: { segments: MixSegment[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
        {total === 0 ? (
          <div className="h-full w-full bg-muted-foreground/10" />
        ) : (
          segments.map((s) =>
            s.value <= 0 ? null : (
              <div
                key={s.label}
                className={cn("h-full min-w-0", s.barClass)}
                style={{ width: `${(s.value / total) * 100}%` }}
              />
            )
          )
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <span className={cn("size-2 shrink-0 rounded-full", s.dotClass)} />
              <span className="truncate">{s.label}</span>
            </div>
            <p className="text-sm font-semibold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MeterRow({
  label,
  value,
  max,
  barClass,
  compact = false,
  tone,
  className,
}: {
  label: string;
  value: number;
  max: number;
  barClass: string;
  compact?: boolean;
  tone?: "success" | "warning" | "info";
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const tile =
    tone === "success"
      ? "hours-tile hours-tile-work"
      : tone === "warning"
        ? "hours-tile hours-tile-break"
        : tone === "info"
          ? "hours-tile hours-tile-idle"
          : null;

  return (
    <div className={cn("flex flex-col", compact ? "gap-1.5" : "gap-2", tile, className)}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className={cn("flex items-center gap-2 font-medium", compact && "text-xs")}>
          <span className={cn("size-2 rounded-full", barClass)} />
          {label}
        </span>
        <span className={cn("font-semibold tabular-nums", compact && "text-xs")}>{value}h</span>
      </div>
      <div className={cn("overflow-hidden rounded-full bg-white/70", compact ? "h-1.5" : "h-2")}>
        <div
          className={cn("meter-fill h-full rounded-full", barClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
