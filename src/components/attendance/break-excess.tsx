import { formatExcess } from "@/lib/format";
import { BREAK_SLOTS, formatBreakType, type BreakExcess } from "@/lib/shift";
import { cn } from "@/lib/utils";

export function breakExcessParts(excess: BreakExcess) {
  const parts = BREAK_SLOTS.filter((slot) => excess[slot] > 0).map(
    (slot) => `${formatBreakType(slot)} +${formatExcess(excess[slot])}`
  );
  if (excess.washroom > 0) parts.push(`Washroom +${formatExcess(excess.washroom)}`);
  return parts;
}

/** Total over-break time with the per-break split underneath. */
export function BreakExcessCell({ excess, className }: { excess: BreakExcess; className?: string }) {
  if (excess.total <= 0) {
    return <span className={cn("text-xs text-muted-foreground", className)}>—</span>;
  }
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <span className="text-xs font-semibold text-destructive tabular-nums">
        +{formatExcess(excess.total)}
      </span>
      <span className="text-[11px] text-muted-foreground tabular-nums">
        {breakExcessParts(excess).join(" · ")}
      </span>
    </div>
  );
}
