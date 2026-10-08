"use client";

import { useEffect, useState } from "react";
import { AttendanceStatusBadge } from "@/components/attendance/attendance-status-badge";
import { AdminLogoutButton } from "@/components/attendance/admin-logout-button";
import { BreakExcessCell } from "@/components/attendance/break-excess";
import { EditAttendanceDialog } from "@/components/attendance/edit-attendance-dialog";
import { StatusBadge } from "@/components/dashboard/status-badge";
import type { TeamTodayRow } from "@/lib/queries/admin-dashboard";
import { dailyActiveSeconds, formatClock } from "@/lib/live-time";
import { formatDuration, formatTimeInZone, INDIA_TIME_ZONE } from "@/lib/format";

export function TeamTodayReport({ rows, attendanceDate }: { rows: TeamTodayRow[]; attendanceDate: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

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
            <th className="px-3 py-2 font-medium">Washroom</th>
            <th className="px-3 py-2 font-medium">Excess break</th>
            <th className="px-3 py-2 text-right font-medium">Hours</th>
            <th className="px-4 py-2 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const seconds = dailyActiveSeconds({
              storedActiveSeconds: row.activeSeconds,
              sessionStartedAt: row.sessionStartedAt,
              sessionClosedBreakSeconds: row.sessionClosedBreakSeconds,
              openBreakStartedAt: row.openBreakStartedAt,
              sessionClosedWashroomSeconds: row.sessionClosedWashroomSeconds,
              openWashroomStartedAt: row.openWashroomStartedAt,
              now: now ?? undefined,
            });
            const washroomLive =
              row.inWashroom && row.openWashroomStartedAt && now != null
                ? Math.max(0, Math.floor((now - new Date(row.openWashroomStartedAt).getTime()) / 1000))
                : 0;
            const washroomTotal = row.washroomSeconds + washroomLive;
            return (
              <tr key={row.id} className="border-t">
                <td className="px-4 py-2.5">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{row.fullName}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{row.employeeCode}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <AttendanceStatusBadge status={row.status} />
                    {row.inMeeting ? <StatusBadge status="MEETING" /> : null}
                    {row.meetingPending ? (
                      <span className="rounded-md bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning-foreground">
                        Meeting requested
                      </span>
                    ) : null}
                    {row.inWashroom ? <StatusBadge status="WASHROOM" /> : null}
                    {row.autoLoggedOutAt ? (
                      <span className="rounded-md bg-info/10 px-1.5 py-0.5 text-[11px] font-medium text-info">
                        Auto logout · {now == null ? "—" : formatTimeInZone(row.autoLoggedOutAt, INDIA_TIME_ZONE)} IST
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {row.washroomVisitCount === 0 && !row.inWashroom ? (
                    "—"
                  ) : (
                    <span className="tabular-nums">
                      {row.washroomVisitCount} {row.washroomVisitCount === 1 ? "visit" : "visits"}
                      {now == null ? "" : ` · ${formatDuration(washroomTotal)}`}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <BreakExcessCell excess={row.breakExcess} />
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                  {now == null ? "—" : formatClock(seconds)}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1.5">
                    <EditAttendanceDialog
                      employeeId={row.id}
                      employeeName={row.fullName}
                      attendanceDate={attendanceDate}
                      attendance={row.attendance ?? undefined}
                    />
                    {row.sessionStartedAt ? (
                      <AdminLogoutButton employeeId={row.id} employeeName={row.fullName} />
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
