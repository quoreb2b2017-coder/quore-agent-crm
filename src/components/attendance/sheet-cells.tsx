import { breakExcessParts } from "@/components/attendance/break-excess";
import { TableCell } from "@/components/ui/table";
import { formatBreakDuration, formatExcess } from "@/lib/format";
import { productiveTargetSeconds, type BreakExcess } from "@/lib/shift";
import { sheetCellClassName } from "@/lib/sheet-styles";
import { cn } from "@/lib/utils";

const OFF_STATUSES = new Set(["ON_LEAVE", "HOLIDAY", "WEEK_OFF", "NO_RECORD"]);

const targetTone = {
  met: "bg-success/10 font-semibold text-success",
  short: "bg-destructive/10 font-semibold text-destructive",
  inProgress: "bg-info/10 font-medium text-info",
  off: "text-muted-foreground",
};

export type TargetResult = { state: keyof typeof targetTone; label: string };

/**
 * Same rule as the productivity chart: days off have no target, today can still be met.
 * Pass `showLeft: false` when the seconds are stored totals rather than the live count for today.
 */
export function targetResult(
  row: { attendance_date: string; status: string; total_active_seconds: number },
  today: string,
  { showLeft = true }: { showLeft?: boolean } = {}
): TargetResult {
  if (OFF_STATUSES.has(row.status)) return { state: "off", label: "—" };
  const left = productiveTargetSeconds(row.status) - row.total_active_seconds;
  if (left <= 0) return { state: "met", label: "On target" };
  if (row.attendance_date === today) {
    return {
      state: "inProgress",
      label: showLeft ? `In progress · ${formatBreakDuration(left)} left` : "In progress",
    };
  }
  return { state: "short", label: `Short by ${formatBreakDuration(left)}` };
}

export function TargetSheetCell({ target }: { target: TargetResult }) {
  return <TableCell className={cn(sheetCellClassName, targetTone[target.state])}>{target.label}</TableCell>;
}

export function ExcessSheetCell({ excess }: { excess: BreakExcess }) {
  const hasExcess = excess.total > 0;
  return (
    <TableCell
      className={cn(
        sheetCellClassName,
        hasExcess ? "bg-destructive/10 text-destructive" : "text-muted-foreground"
      )}
    >
      {hasExcess ? (
        <div className="flex flex-col">
          <span className="font-bold">+{formatExcess(excess.total)}</span>
          <span className="text-[11px]">{breakExcessParts(excess).join(" · ")}</span>
        </div>
      ) : (
        "—"
      )}
    </TableCell>
  );
}
