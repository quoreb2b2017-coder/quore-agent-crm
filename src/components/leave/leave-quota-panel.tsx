import type { ReactNode } from "react";
import { CalendarDays, CheckCircle2, Clock3, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { ANNUAL_PAID_LEAVE_DAYS } from "@/lib/leave";

type Tile = {
  label: string;
  value: number;
  hint: string;
  icon: typeof Wallet;
  tone: "info" | "used" | "success" | "warning";
};

const toneClass = {
  info: "text-info bg-info/10",
  used: "text-foreground bg-muted",
  success: "text-success bg-success/10",
  warning: "text-warning-foreground bg-warning/15",
} as const;

export function LeaveQuotaPanel({
  year,
  available,
  used,
  remaining,
  pending,
  peopleLabel,
  filter,
}: {
  year: number;
  available: number;
  used: number;
  remaining: number;
  pending: number;
  peopleLabel: string;
  filter?: ReactNode;
}) {
  const percentUsed = available > 0 ? Math.min(100, Math.round((used / available) * 100)) : 0;
  const tiles: Tile[] = [
    {
      label: "Available",
      value: available,
      hint: `${ANNUAL_PAID_LEAVE_DAYS} paid days / year`,
      icon: Wallet,
      tone: "info",
    },
    {
      label: "Used",
      value: used,
      hint: "Approved this year",
      icon: CheckCircle2,
      tone: "used",
    },
    {
      label: "Remaining",
      value: remaining,
      hint: percentUsed ? `${percentUsed}% of quota used` : "Full quota open",
      icon: CalendarDays,
      tone: "success",
    },
    {
      label: "Pending",
      value: pending,
      hint: "Days waiting approval",
      icon: Clock3,
      tone: "warning",
    },
  ];

  return (
    <section className="overflow-hidden rounded-3xl border bg-card shadow-[0_10px_30px_oklch(0.21_0.02_260/0.04)]">
      <div className="flex flex-col gap-4 border-b bg-muted/25 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight">Paid leave · {year}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {peopleLabel}. Saturday and Sunday are week off and are not deducted.
          </p>
        </div>
        {filter ? <div className="w-full min-w-0 lg:max-w-sm">{filter}</div> : null}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile, index) => {
          const Icon = tile.icon;
          return (
            <div
              key={tile.label}
              className={cn(
                "flex flex-col gap-3 p-5",
                index % 2 === 1 && "border-l",
                index >= 2 && "border-t lg:border-t-0",
                index >= 1 && "lg:border-l"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {tile.label}
                </p>
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-xl",
                    toneClass[tile.tone]
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
              </div>
              <div>
                <p className="text-3xl font-semibold tracking-tight tabular-nums">{tile.value}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{tile.hint}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t px-5 py-3.5">
        <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Quota used</span>
          <span className="tabular-nums">
            {used} of {available} days
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${percentUsed}%` }}
          />
        </div>
      </div>
    </section>
  );
}
