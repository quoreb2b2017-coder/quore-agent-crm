import { Fragment } from "react";
import { CalendarCheck } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { EditAttendanceDialog } from "@/components/attendance/edit-attendance-dialog";
import { ExcessSheetCell, TargetSheetCell, targetResult } from "@/components/attendance/sheet-cells";
import { AttendanceLeaveMark } from "@/components/leave/leave-reason-tip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatBreakDuration,
  formatDuration,
  formatExcess,
  formatIsoDate,
  formatMonthLabel,
  formatTime,
} from "@/lib/format";
import { emptyExcess, PRODUCTIVE_HOURS_LABEL, type BreakExcess } from "@/lib/shift";
import {
  sheetCellClassName as cellClassName,
  sheetDateRowClassName,
  sheetHeadClassName as headClassName,
  sheetRowClassName,
} from "@/lib/sheet-styles";
import { cn } from "@/lib/utils";
import type { AttendanceSheetRow } from "@/lib/queries/attendance-sheet";

const totalCellClassName = "border-b-2 border-b-ink/50 font-bold";
const frozenMonthClassName = "sm:sticky sm:left-0 w-32 min-w-32";
const frozenDateClassName = "sm:sticky sm:left-32";

/** Newest month first; each month runs from its first date to its last, then its total. */
function groupByMonth(attendance: AttendanceSheetRow[]) {
  const byMonth = new Map<string, AttendanceSheetRow[]>();
  for (const row of attendance) {
    const month = row.attendance_date.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), row]);
  }
  return [...byMonth.keys()]
    .sort((a, b) => b.localeCompare(a))
    .map((month) => ({
      month,
      rows: (byMonth.get(month) ?? []).sort((a, b) =>
        a.attendance_date.localeCompare(b.attendance_date)
      ),
    }));
}

export function AttendanceSheet({
  employeeId,
  employeeName,
  today,
  attendance,
  excessByDate,
  leaveByDate = {},
  canEdit = false,
  showTimeLeft = false,
}: {
  employeeId: string;
  employeeName: string;
  today: string;
  attendance: AttendanceSheetRow[];
  excessByDate: Record<string, BreakExcess>;
  leaveByDate?: Record<string, { subject?: string | null; reason?: string | null }>;
  /** Admin only: adds the Edit column. */
  canEdit?: boolean;
  /** Only when today's seconds in `attendance` are the live count. */
  showTimeLeft?: boolean;
}) {
  const excessOf = (row: AttendanceSheetRow) => excessByDate[row.attendance_date]?.total ?? 0;
  const excessDays = attendance.filter((row) => excessOf(row) > 0).length;
  const excessTotal = attendance.reduce((sum, row) => sum + excessOf(row), 0);
  const targetOf = (row: AttendanceSheetRow) => targetResult(row, today, { showLeft: showTimeLeft });

  return (
    <section className="border bg-card">
      <div className="border-b bg-muted px-3 py-2">
        <h2 className="text-sm font-semibold">Attendance</h2>
        <p className="text-xs text-muted-foreground">
          Last 12 months, month by month · Daily target {PRODUCTIVE_HOURS_LABEL} productive
        </p>
      </div>
      {attendance.length === 0 ? (
        <div className="p-6">
          <EmptyState icon={CalendarCheck} title="No attendance in the last 12 months" />
        </div>
      ) : (
        <div className="[&>[data-slot=table-container]]:max-h-[75svh]">
          <Table className="border-separate border-spacing-0">
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(headClassName, frozenMonthClassName, "z-[2]")}>Month</TableHead>
                <TableHead className={cn(headClassName, frozenDateClassName, "z-[2]")}>Date</TableHead>
                <TableHead className={headClassName}>Status</TableHead>
                <TableHead className={headClassName}>Check in</TableHead>
                <TableHead className={headClassName}>Check out</TableHead>
                <TableHead className={headClassName}>Productive</TableHead>
                <TableHead className={headClassName}>Target</TableHead>
                <TableHead className={headClassName}>Break</TableHead>
                <TableHead className={headClassName}>Overtime</TableHead>
                <TableHead className={cn(headClassName, !canEdit && "border-r-0")}>Excess break</TableHead>
                {canEdit ? (
                  <TableHead className={cn(headClassName, "border-r-0 text-center")}>Edit</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupByMonth(attendance).map(({ month, rows }) => {
                const monthExcess = rows.reduce((sum, row) => sum + excessOf(row), 0);
                const monthOvertime = rows.reduce((sum, row) => sum + row.overtime_minutes, 0);
                const monthPresent = rows.filter((row) =>
                  ["PRESENT", "LATE", "HALF_DAY"].includes(row.status)
                ).length;
                const monthTargets = rows.map((row) => targetOf(row).state);
                const monthMet = monthTargets.filter((state) => state === "met").length;
                const monthShort = monthTargets.filter((state) => state === "short").length;
                return (
                  <Fragment key={month}>
                    {rows.map((row, index) => {
                      const excess = excessByDate[row.attendance_date] ?? emptyExcess();
                      const hasExcess = excess.total > 0;
                      return (
                        <TableRow key={row.id} className={sheetRowClassName}>
                          {index === 0 ? (
                            <TableCell
                              rowSpan={rows.length + 1}
                              className={cn(
                                cellClassName,
                                frozenMonthClassName,
                                totalCellClassName,
                                "z-[1] bg-muted align-top font-semibold"
                              )}
                            >
                              <span className="sticky top-11 block py-1.5">{formatMonthLabel(month)}</span>
                            </TableCell>
                          ) : null}
                          <TableCell
                            className={cn(cellClassName, frozenDateClassName, "z-[1] bg-inherit font-medium")}
                          >
                            {formatIsoDate(row.attendance_date)}
                          </TableCell>
                          <TableCell className={cn(cellClassName, "[&_[data-slot=badge]]:rounded-sm")}>
                            <AttendanceLeaveMark status={row.status} {...leaveByDate[row.attendance_date]} />
                          </TableCell>
                          <TableCell className={cn(cellClassName, "text-muted-foreground")}>
                            {row.first_check_in ? formatTime(row.first_check_in) : "—"}
                          </TableCell>
                          <TableCell className={cn(cellClassName, "text-muted-foreground")}>
                            {row.last_check_out ? formatTime(row.last_check_out) : "—"}
                          </TableCell>
                          <TableCell className={cn(cellClassName, "font-medium")}>
                            {formatDuration(row.total_active_seconds)}
                          </TableCell>
                          <TargetSheetCell target={targetOf(row)} />
                          <TableCell
                            className={cn(cellClassName, hasExcess && "font-semibold text-destructive")}
                          >
                            {formatBreakDuration(row.total_break_seconds)}
                          </TableCell>
                          <TableCell className={cn(cellClassName, "text-muted-foreground")}>
                            {row.overtime_minutes > 0 ? `${row.overtime_minutes} min` : "—"}
                          </TableCell>
                          <ExcessSheetCell excess={excess} />
                          {canEdit ? (
                            <TableCell className={cn(cellClassName, "border-r-0 px-1.5 text-center")}>
                              <EditAttendanceDialog
                                employeeId={employeeId}
                                employeeName={employeeName}
                                attendanceDate={row.attendance_date}
                                attendance={row}
                              />
                            </TableCell>
                          ) : null}
                        </TableRow>
                      );
                    })}
                    <TableRow className={sheetDateRowClassName}>
                      <TableCell
                        className={cn(cellClassName, frozenDateClassName, totalCellClassName, "z-[1] bg-inherit")}
                      >
                        Total · {rows.length} {rows.length === 1 ? "day" : "days"}
                      </TableCell>
                      <TableCell className={cn(cellClassName, totalCellClassName)}>
                        {monthPresent} present
                      </TableCell>
                      <TableCell className={cn(cellClassName, totalCellClassName)} />
                      <TableCell className={cn(cellClassName, totalCellClassName)} />
                      <TableCell className={cn(cellClassName, totalCellClassName)}>
                        {formatDuration(rows.reduce((sum, row) => sum + row.total_active_seconds, 0))}
                      </TableCell>
                      <TableCell className={cn(cellClassName, totalCellClassName)}>
                        {monthMet + monthShort > 0 ? `${monthMet} of ${monthMet + monthShort} on target` : "—"}
                      </TableCell>
                      <TableCell className={cn(cellClassName, totalCellClassName)}>
                        {formatBreakDuration(rows.reduce((sum, row) => sum + row.total_break_seconds, 0))}
                      </TableCell>
                      <TableCell className={cn(cellClassName, totalCellClassName)}>
                        {monthOvertime > 0 ? `${monthOvertime} min` : "—"}
                      </TableCell>
                      <TableCell
                        className={cn(
                          cellClassName,
                          totalCellClassName,
                          monthExcess > 0 && "bg-destructive/10 text-destructive"
                        )}
                      >
                        {monthExcess > 0 ? `+${formatExcess(monthExcess)}` : "—"}
                      </TableCell>
                      {canEdit ? <TableCell className={cn(cellClassName, totalCellClassName, "border-r-0")} /> : null}
                    </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="border-t bg-muted px-3 py-1.5 text-xs text-muted-foreground tabular-nums">
        <span className="font-semibold text-foreground">{attendance.length}</span> days
        {excessDays > 0 ? (
          <>
            {" · "}
            <span className="font-semibold text-destructive">
              Excess break on {excessDays} {excessDays === 1 ? "day" : "days"}, total +
              {formatExcess(excessTotal)}
            </span>
          </>
        ) : null}
      </p>
    </section>
  );
}
