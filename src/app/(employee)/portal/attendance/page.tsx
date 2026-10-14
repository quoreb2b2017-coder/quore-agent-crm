import { CalendarCheck } from "lucide-react";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { getMySessionState } from "@/lib/queries/employee-status";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { todayIso } from "@/lib/format";
import { ensureWeekendOff } from "@/lib/attendance-weekend";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ClockWidget } from "@/components/attendance/clock-widget";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDuration, formatTime, shiftWindowLabel } from "@/lib/format";
import { BREAK_POLICY_LABEL, creditedProductiveSeconds } from "@/lib/shift";
import { formatLeaveComment } from "@/lib/leave";
import { leaveNotesByDay } from "@/lib/queries/leave";
import { AttendanceLeaveMark } from "@/components/leave/leave-reason-tip";

export default async function MyAttendancePage() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return null;

  const [sessionState, supabase] = await Promise.all([
    getMySessionState(ctx.employeeId),
    createClient(),
  ]);
  await ensureWeekendOff(supabase, ctx.employeeId, todayIso());

  const { data: history } = await supabase
    .from("attendance")
    .select("attendance_date, status, first_check_in, last_check_out, total_active_seconds, total_break_seconds, notes")
    .eq("employee_id", ctx.employeeId)
    .order("attendance_date", { ascending: false })
    .limit(30);
  const dates = (history ?? []).map((row) => row.attendance_date).sort();
  const leaveNotes =
    dates.length > 0
      ? await leaveNotesByDay([ctx.employeeId], dates[0], dates[dates.length - 1])
      : new Map();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Attendance"
        description={`${shiftWindowLabel()} · ${BREAK_POLICY_LABEL} · marked on login`}
      />

      <ClockWidget session={sessionState} />

      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="p-0">
          {!history || history.length === 0 ? (
            <div className="p-4">
              <EmptyState icon={CalendarCheck} title="No attendance history yet" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Check In</TableHead>
                  <TableHead>Check Out</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Break</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.attendance_date}>
                    <TableCell>{formatDate(h.attendance_date)}</TableCell>
                    <TableCell>
                      <AttendanceLeaveMark
                        status={h.status}
                        {...(() => {
                          const request = leaveNotes.get(`${ctx.employeeId}|${h.attendance_date}`);
                          if (request?.reason) return { subject: request.subject, reason: request.reason };
                          return formatLeaveComment(h.notes);
                        })()}
                      />
                    </TableCell>
                    <TableCell>
                      {h.first_check_in ? formatTime(h.first_check_in) : "—"}
                    </TableCell>
                    <TableCell>
                      {h.last_check_out ? formatTime(h.last_check_out) : "—"}
                    </TableCell>
                    <TableCell>
                      {formatDuration(creditedProductiveSeconds(h.total_active_seconds, h.status))}
                    </TableCell>
                    <TableCell>{formatDuration(h.total_break_seconds)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
