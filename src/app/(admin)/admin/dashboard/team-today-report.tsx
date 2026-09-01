import { formatDuration } from "@/lib/format";
import { AttendanceStatusBadge } from "@/components/attendance/attendance-status-badge";
import type { TeamTodayRow } from "@/lib/queries/admin-dashboard";

export function TeamTodayReport({ rows }: { rows: TeamTodayRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-8 text-center text-sm text-muted-foreground">
        No employees to show
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-card text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-4 py-2 font-medium">Employee</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-4 py-2 text-right font-medium">Hours</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t">
              <td className="px-4 py-2.5">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{row.fullName}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{row.employeeCode}</span>
                </div>
              </td>
              <td className="px-3 py-2.5">
                <AttendanceStatusBadge status={row.status} />
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {formatDuration(row.activeSeconds)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
