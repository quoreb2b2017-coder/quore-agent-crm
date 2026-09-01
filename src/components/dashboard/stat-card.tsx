import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const toneClasses = {
  default: "bg-muted text-muted-foreground",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning-foreground",
  destructive: "bg-destructive/10 text-destructive",
  info: "bg-info/10 text-info",
} as const;

const barClasses = {
  default: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  info: "bg-info",
} as const;

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  hint,
  progress,
  compact = false,
  packed = false,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: keyof typeof toneClasses;
  hint?: string;
  progress?: number;
  compact?: boolean;
  packed?: boolean;
}) {
  const pct = progress == null ? null : Math.max(0, Math.min(100, progress));

  return (
    <div
      className={cn(
        "dash-stat backdrop-blur-sm",
        packed
          ? "rounded-none border-0 p-3.5 shadow-none"
          : compact
            ? "rounded-2xl border p-3.5"
            : "rounded-2xl border p-5 shadow-[0_8px_24px_oklch(0.21_0.02_260/0.03)]"
      )}
      data-tone={tone}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={cn("font-medium text-muted-foreground", compact ? "text-xs" : "text-sm")}>
          {label}
        </p>
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl",
            compact ? "size-8" : "size-9",
            toneClasses[tone]
          )}
        >
          <Icon className={compact ? "size-3.5" : "size-4"} />
        </div>
      </div>
      <p
        className={cn(
          "font-semibold tracking-tight tabular-nums",
          compact ? "mt-2 text-xl" : "mt-4 text-3xl"
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
      {pct != null ? (
        <div className={cn("progress-track", compact ? "mt-2.5" : "mt-4")}>
          <div className={cn("progress-fill", barClasses[tone])} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}
