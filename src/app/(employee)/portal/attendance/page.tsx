import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { getMySessionState } from "@/lib/queries/employee-status";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { addDaysIso, shiftWindowLabel, todayIso } from "@/lib/format";
import { ensureWeekendOff } from "@/lib/attendance-weekend";
import { PageHeader } from "@/components/dashboard/page-header";
import { ExcelDownloadButton } from "@/components/activity/excel-download-button";
import { AttendanceSheet } from "@/components/attendance/attendance-sheet";
import { ClockWidget } from "@/components/attendance/clock-widget";
import { BREAK_POLICY_LABEL, creditedProductiveSeconds, istLocalToUtc } from "@/lib/shift";
import { formatLeaveComment } from "@/lib/leave";
import { loadAttendanceSheet, sheetStartIso } from "@/lib/queries/attendance-sheet";
import { leaveNotesByDay } from "@/lib/queries/leave";

export default async function MyAttendancePage() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return null;

  const [sessionState, supabase] = await Promise.all([
    getMySessionState(ctx.employeeId),
    createClient(),
  ]);
  const today = todayIso();
  await ensureWeekendOff(supabase, ctx.employeeId, today);

  const [sheet, leaveNotes] = await Promise.all([
    loadAttendanceSheet(ctx.employeeId, today, istLocalToUtc(addDaysIso(today, 2), 0, 0).toISOString()),
    leaveNotesByDay([ctx.employeeId], sheetStartIso(today), today),
  ]);
  const leaveByDate = Object.fromEntries(
    sheet.rows.map((row) => {
      const request = leaveNotes.get(`${ctx.employeeId}|${row.attendance_date}`);
      return [
        row.attendance_date,
        request?.reason ? { subject: request.subject, reason: request.reason } : formatLeaveComment(row.notes),
      ];
    })
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Attendance"
        description={`${shiftWindowLabel()} · ${BREAK_POLICY_LABEL} · marked on login`}
        actions={<ExcelDownloadButton href={`/api/attendance/excel?view=yearly&year=${today.slice(0, 4)}`} />}
      />

      <ClockWidget session={sessionState} />

      <AttendanceSheet
        employeeId={ctx.employeeId}
        employeeName={ctx.fullName}
        today={today}
        attendance={sheet.rows.map((row) => ({
          ...row,
          total_active_seconds: creditedProductiveSeconds(row.total_active_seconds, row.status),
        }))}
        excessByDate={sheet.excessByDate}
        leaveByDate={leaveByDate}
      />
    </div>
  );
}
