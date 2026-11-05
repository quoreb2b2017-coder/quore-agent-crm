"use client";

import Link from "next/link";
import { AttendanceStatusBadge } from "@/components/attendance/attendance-status-badge";
import { AdminLogoutButton } from "@/components/attendance/admin-logout-button";
import { ApproveOvertimeDialog } from "@/components/attendance/approve-overtime-dialog";
import { EditAttendanceDialog } from "@/components/attendance/edit-attendance-dialog";
import { ExcessSheetCell } from "@/components/attendance/sheet-cells";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { useLiveNowMs } from "@/components/layout/trusted-clock";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TeamTodayRow } from "@/lib/queries/admin-dashboard";
import { dailyActiveSeconds, formatClock } from "@/lib/live-time";
import { creditedProductiveSeconds } from "@/lib/shift";
import { formatDuration, formatTimeInZone, INDIA_TIME_ZONE } from "@/lib/format";
import { sheetCellClassName, sheetHeadClassName, sheetRowClassName } from "@/lib/sheet-styles";
import { cn } from "@/lib/utils";

const frozenClassName = "sm:sticky sm:left-0";

export function TeamTodayReport({ rows, attendanceDate }: { rows: TeamTodayRow[]; attendanceDate: string }) {
  const now = useLiveNowMs();

  if (rows.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-8 text-center text-sm text-muted-foreground">
        No employees to show
      </div>
    );
  }

  return (
    <div className="[&>[data-slot=table-container]]:max-h-[65svh]">
      <Table className="border-separate border-spacing-0">
        <TableHeader className="sticky top-0 z-10">
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(sheetHeadClassName, frozenClassName, "z-[2]")}>Name</TableHead>
            <TableHead className={sheetHeadClassName}>Employee ID</TableHead>
            <TableHead className={sheetHeadClassName}>Status</TableHead>
            <TableHead className={sheetHeadClassName}>Login</TableHead>
            <TableHead className={sheetHeadClassName}>Washroom</TableHead>
            <TableHead className={sheetHeadClassName}>Excess break</TableHead>
            <TableHead className={cn(sheetHeadClassName, "text-right")}>Hours</TableHead>
            <TableHead className={cn(sheetHeadClassName, "border-r-0 text-right")}>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const seconds = creditedProductiveSeconds(dailyActiveSeconds({
              storedActiveSeconds: row.activeSeconds,
              sessionStartedAt: row.sessionStartedAt,
              sessionClosedBreakSeconds: row.sessionClosedBreakSeconds,
              openBreakStartedAt: row.openBreakStartedAt,
              sessionClosedWashroomSeconds: row.sessionClosedWashroomSeconds,
              openWashroomStartedAt: row.openWashroomStartedAt,
              now: now ?? undefined,
              overtimeMinutes: row.overtimeMinutes,
              settings: row.workSettings,
            }), row.status);
            const washroomLive =
              row.inWashroom && row.openWashroomStartedAt && now != null
                ? Math.max(0, Math.floor((now - new Date(row.openWashroomStartedAt).getTime()) / 1000))
                : 0;
            const washroomTotal = row.washroomSeconds + washroomLive;
            const loginAt = row.attendance?.first_check_in ?? row.sessionStartedAt;
            return (
              <TableRow key={row.id} className={sheetRowClassName}>
                <TableCell className={cn(sheetCellClassName, frozenClassName, "z-[1] bg-inherit")}>
                  <Link
                    href={`/admin/dashboard?employee=${row.id}`}
                    title={`Open ${row.fullName}'s dashboard`}
                    className="font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    {row.fullName}
                  </Link>
                </TableCell>
                <TableCell className={cn(sheetCellClassName, "font-mono text-xs font-semibold")}>
                  {row.employeeCode}
                </TableCell>
                <TableCell className={cn(sheetCellClassName, "[&_[data-slot=badge]]:rounded-sm")}>
                  <div className="flex items-center gap-1.5">
                    <AttendanceStatusBadge status={row.status} />
                    {row.inMeeting ? <StatusBadge status="MEETING" /> : null}
                    {row.meetingPending ? (
                      <span className="rounded-sm bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning">
                        Meeting requested
                      </span>
                    ) : null}
                    {row.inWashroom ? <StatusBadge status="WASHROOM" /> : null}
                    {row.autoLoggedOutAt ? (
                      <span className="rounded-sm bg-info/10 px-1.5 py-0.5 text-[11px] font-medium text-info">
                        Auto logout · {now == null ? "—" : formatTimeInZone(row.autoLoggedOutAt, INDIA_TIME_ZONE)} IST
                      </span>
                    ) : null}
                    {row.overtimeMinutes > 0 ? (
                      <span className="rounded-sm bg-info/10 px-1.5 py-0.5 text-[11px] font-medium text-info">
                        OT {row.overtimeMinutes}m
                      </span>
                    ) : null}
                    {row.overtimePendingMinutes > 0 ? (
                      <span className="rounded-sm bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning">
                        OT pending {row.overtimePendingMinutes}m
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className={cn(sheetCellClassName, "font-medium")}>
                  {loginAt ? (
                    `${formatTimeInZone(loginAt, INDIA_TIME_ZONE)} IST`
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className={cn(sheetCellClassName, "text-muted-foreground")}>
                  {row.washroomVisitCount === 0 && !row.inWashroom ? (
                    "—"
                  ) : (
                    <>
                      {row.washroomVisitCount} {row.washroomVisitCount === 1 ? "visit" : "visits"}
                      {now == null ? "" : ` · ${formatDuration(washroomTotal)}`}
                    </>
                  )}
                </TableCell>
                <ExcessSheetCell excess={row.breakExcess} />
                <TableCell className={cn(sheetCellClassName, "text-right font-mono font-semibold")}>
                  {now == null ? "—" : formatClock(seconds)}
                </TableCell>
                <TableCell className={cn(sheetCellClassName, "border-r-0 px-1.5")}>
                  <div className="flex justify-end gap-1.5">
                    <ApproveOvertimeDialog
                      employeeId={row.id}
                      employeeName={row.fullName}
                      attendanceDate={attendanceDate}
                      pendingMinutes={row.overtimePendingMinutes}
                    />
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
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
