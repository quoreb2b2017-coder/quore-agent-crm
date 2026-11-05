import type { ReactNode } from "react";
import { SheetKpi } from "@/components/dashboard/sheet-kpi";

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

  return (
    <section className="border bg-card">
      <div className="flex flex-col gap-3 border-b bg-muted px-3 py-2 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Paid leave · {year}</p>
          <p className="text-xs text-muted-foreground">
            {peopleLabel}. Saturday and Sunday are week off and are not deducted.
          </p>
        </div>
        {filter ? <div className="w-full min-w-0 lg:max-w-sm">{filter}</div> : null}
      </div>
      <dl className="grid grid-cols-2 xl:grid-cols-4">
        <SheetKpi label="Available" value={available} valueClassName="text-info" hint="Paid days this year" />
        <SheetKpi
          label="Used"
          value={used}
          hint={`${used} of ${available} days · approved and marked`}
          progress={percentUsed}
        />
        <SheetKpi
          label="Remaining"
          value={remaining}
          valueClassName={remaining > 0 ? "text-success" : "text-destructive"}
          hint={percentUsed ? `${percentUsed}% of quota used` : "Full quota open"}
        />
        <SheetKpi
          label="Pending"
          value={pending}
          valueClassName={pending > 0 ? "text-warning" : undefined}
          hint="Days waiting approval"
        />
      </dl>
    </section>
  );
}
