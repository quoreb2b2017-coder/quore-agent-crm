import { EmployeeActivityLog } from "@/components/activity/employee-activity-log";
import { formatIsoDate } from "@/lib/format";
import { shiftDayLines, shiftShortSummary, type ShiftDayTone } from "@/lib/shift-completion";
import type { ProductivityRow } from "@/lib/queries/productivity-report";
import { cn } from "@/lib/utils";

const toneClass: Record<ShiftDayTone, string> = {
  complete: "bg-success/15 text-success",
  short: "bg-destructive/10 text-destructive",
  progress: "bg-warning/15 text-warning-foreground",
  off: "bg-muted text-muted-foreground",
};

export function ShiftCompletion({ rows }: { rows: ProductivityRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {rows.map((row) => {
        const lines = shiftDayLines(row.days);
        const summary = shiftShortSummary(row.days);
        return (
          <section key={row.employee.id} className="overflow-hidden rounded-2xl border bg-card">
            <div className="flex flex-col gap-1 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <EmployeeActivityLog
                employeeId={row.employee.id}
                fullName={row.employee.full_name}
                employeeCode={row.employee.employee_code}
                className="flex-none px-1 py-0.5"
              />
              <p className="text-xs font-medium text-muted-foreground">{summary.label}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-4 py-2 font-medium">Day</th>
                    <th className="px-4 py-2 font-medium">Shift</th>
                    <th className="px-4 py-2 font-medium">Worked</th>
                    <th className="px-4 py-2 font-medium">Target</th>
                    <th className="px-4 py-2 font-medium">Short</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.date} className="border-b last:border-0">
                      <td className="px-4 py-2 whitespace-nowrap">{formatIsoDate(line.date)}</td>
                      <td className="px-4 py-2">
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", toneClass[line.tone])}>
                          {line.result}
                        </span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">{line.worked}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{line.target}</td>
                      <td
                        className={cn(
                          "px-4 py-2 whitespace-nowrap font-medium",
                          line.tone === "short" && "text-destructive",
                          line.tone === "complete" && "text-success"
                        )}
                      >
                        {line.short}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
