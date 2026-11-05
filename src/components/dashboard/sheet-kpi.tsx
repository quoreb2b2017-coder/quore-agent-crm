import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** One figure in a flat summary strip. Put these in a `<dl>` with a grid, border and card background. */
export function SheetKpi({
  label,
  value,
  hint,
  valueClassName,
  hintClassName,
  progress,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  valueClassName?: string;
  hintClassName?: string;
  progress?: number;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 border-r border-b px-4 py-2.5 xl:border-b-0 xl:last:border-r-0">
      <dt className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</dt>
      <dd className={cn("text-xl font-bold tabular-nums", valueClassName)}>{value}</dd>
      {hint ? <dd className={cn("truncate text-xs text-muted-foreground", hintClassName)}>{hint}</dd> : null}
      {progress != null ? (
        <dd className="progress-track mt-1">
          <div className="progress-fill bg-info" style={{ width: `${progress}%` }} />
        </dd>
      ) : null}
    </div>
  );
}
