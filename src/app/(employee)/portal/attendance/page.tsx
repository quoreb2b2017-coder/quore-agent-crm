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
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDuration, formatTime, shiftWindowLabel } from "@/lib/format";
import { BREAK_POLICY_LABEL } from "@/lib/shift";
import { cn } from "@/lib/utils";

const statusTone: Record<string, string> = {
  PRESENT: "bg-success/10 text-success border-success/20",
  ABSENT: "bg-destructive/10 text-destructive border-destructive/20",
  HALF_DAY: "bg-warning/10 text-warning border-warning/20",
  ON_LEAVE: "bg-info/10 text-info border-info/20",
  HOLIDAY: "bg-muted text-muted-foreground border-transparent",
  WEEK_OFF: "bg-muted text-muted-foreground border-transparent",
};

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
    .select("attendance_date, status, first_check_in, last_check_out, total_active_seconds, total_break_seconds")
    .eq("employee_id", ctx.employeeId)
    .order("attendance_date", { ascending: false })
    .limit(30);

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
                      <Badge variant="outline" className={cn("font-medium", statusTone[h.status])}>
                        {h.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {h.first_check_in ? formatTime(h.first_check_in) : "—"}
                    </TableCell>
                    <TableCell>
                      {h.last_check_out ? formatTime(h.last_check_out) : "—"}
                    </TableCell>
                    <TableCell>{formatDuration(h.total_active_seconds)}</TableCell>
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
