import Link from "next/link";
import {
  Timer,
  Coffee,
  TrendingUp,
  CalendarCheck,
  Radio,
  Wallet,
  CalendarDays,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ProductivityChart } from "@/components/dashboard/productivity-chart";
import { BreaksPanel } from "@/components/dashboard/breaks-panel";
import { AttendanceStatusBadge } from "@/components/attendance/attendance-status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatDuration,
  formatInr,
  formatIsoDate,
  formatTime,
} from "@/lib/format";
import {
  BREAK_POLICY_LABEL,
  PRODUCTIVE_HOURS_LABEL,
  PRODUCTIVE_SECONDS,
} from "@/lib/shift";
import { cn } from "@/lib/utils";
import type { EmployeeHistoryPayload } from "@/lib/queries/employee-history";

const leaveTone: Record<string, string> = {
  APPROVED: "bg-success/10 text-success border-success/20",
  PENDING: "bg-warning/10 text-warning border-warning/20",
  REJECTED: "bg-destructive/10 text-destructive border-destructive/20",
  CANCELLED: "bg-muted text-muted-foreground border-transparent",
};

export function EmployeeHistory({
  employeeId,
  data,
  showPayroll = true,
}: {
  employeeId: string;
  data: EmployeeHistoryPayload;
  showPayroll?: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Present (30 days)"
          value={data.presentDays}
          icon={CalendarCheck}
          tone="success"
          hint={data.leaveDays > 0 ? `${data.leaveDays} on leave` : "Shift days marked present"}
        />
        <StatCard
          label="Productivity today"
          value={`${data.todayProductivityPct}%`}
          icon={TrendingUp}
          tone="info"
          hint={`vs ${PRODUCTIVE_HOURS_LABEL}`}
          progress={Math.min(100, data.todayProductivityPct)}
        />
        <StatCard
          label="Productive (30 days)"
          value={formatDuration(data.activeSeconds)}
          icon={Timer}
          tone="success"
          hint={`Today ${formatDuration(data.todayActiveSeconds)} of ${formatDuration(PRODUCTIVE_SECONDS)}`}
        />
        <StatCard
          label="Breaks (30 days)"
          value={formatDuration(data.breakSeconds)}
          icon={Coffee}
          tone="warning"
          hint={BREAK_POLICY_LABEL}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="gap-0 py-0 lg:col-span-3">
          <CardHeader className="border-b py-4">
            <CardTitle className="text-[15px] font-semibold">Productivity — last 7 shifts</CardTitle>
            <p className="text-sm text-muted-foreground">
              Productive hours vs the {PRODUCTIVE_HOURS_LABEL} target
            </p>
          </CardHeader>
          <CardContent className="py-5">
            <ProductivityChart data={data.chartData} />
          </CardContent>
        </Card>

        <Card className="gap-0 py-0 lg:col-span-2">
          <CardHeader className="border-b py-4">
            <CardTitle className="text-[15px] font-semibold">Today&apos;s activity</CardTitle>
            <p className="text-sm text-muted-foreground">Login, logout, and breaks this shift</p>
          </CardHeader>
          <CardContent className="py-4">
            {data.timeline.length === 0 ? (
              <EmptyState
                icon={Radio}
                title="No activity yet today"
                description="Clock-in and breaks will appear here."
              />
            ) : (
              <ol className="flex flex-col gap-3">
                {data.timeline.map((event, index) => (
                  <li key={`${event.time}-${index}`} className="flex items-center gap-3 text-sm">
                    <span className="w-[4.5rem] shrink-0 tabular-nums text-muted-foreground">
                      {formatTime(event.time)}
                    </span>
                    <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{event.label}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b py-4">
          <CardTitle className="text-[15px] font-semibold">Attendance</CardTitle>
          <p className="text-sm text-muted-foreground">Last 30 shift days, with check-in and hours</p>
        </CardHeader>
        <CardContent className="p-0">
          {data.attendance.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={CalendarCheck} title="No attendance in the last 30 days" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Check in</TableHead>
                  <TableHead>Check out</TableHead>
                  <TableHead>Productive</TableHead>
                  <TableHead>Break</TableHead>
                  <TableHead className="pr-5">Idle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.attendance.map((row) => (
                  <TableRow key={row.id} className="hover:bg-muted/40">
                    <TableCell className="pl-5 font-medium">{formatIsoDate(row.attendance_date)}</TableCell>
                    <TableCell>
                      <AttendanceStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {row.first_check_in ? formatTime(row.first_check_in) : "—"}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {row.last_check_out ? formatTime(row.last_check_out) : "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDuration(row.total_active_seconds)}</TableCell>
                    <TableCell className="tabular-nums">{formatDuration(row.total_break_seconds)}</TableCell>
                    <TableCell className="pr-5 tabular-nums">{formatDuration(row.total_idle_seconds)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <BreaksPanel
        rows={data.breaks}
        showEmployee={false}
        description={`${BREAK_POLICY_LABEL}. Breaks taken by this employee in the last 30 days.`}
        emptyDescription="No tea or lunch breaks recorded in the last 30 days."
      />

      <section className={showPayroll ? "grid grid-cols-1 gap-4 lg:grid-cols-2" : "grid grid-cols-1"}>
        {showPayroll ? (
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-[15px] font-semibold">Payroll</CardTitle>
                <p className="text-sm text-muted-foreground">Current salary setup</p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/admin/salary-slips?employee=${employeeId}`}>
                  <Wallet className="size-3.5" />
                  Salary slip
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="py-5">
            {data.payroll ? (
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Base</dt>
                  <dd className="mt-0.5 font-medium tabular-nums">{formatInr(data.payroll.base)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">HRA</dt>
                  <dd className="mt-0.5 font-medium tabular-nums">{formatInr(data.payroll.hra)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Allowance</dt>
                  <dd className="mt-0.5 font-medium tabular-nums">{formatInr(data.payroll.allowance)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Gross</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums">{formatInr(data.payroll.gross)}</dd>
                </div>
              </dl>
            ) : (
              <EmptyState
                icon={Wallet}
                title="Payroll not set up"
                description="Set this up from Payroll in the sidebar."
              />
            )}
          </CardContent>
        </Card>
        ) : null}

        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b py-4">
            <CardTitle className="text-[15px] font-semibold">Leave</CardTitle>
            <p className="text-sm text-muted-foreground">Recent leave requests</p>
          </CardHeader>
          <CardContent className="p-0">
            {data.leaves.length === 0 ? (
              <div className="p-6">
                <EmptyState icon={CalendarDays} title="No leave requests" />
              </div>
            ) : (
              <ul className="divide-y">
                {data.leaves.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.leaveType}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatIsoDate(row.start_date)} – {formatIsoDate(row.end_date)} · {row.days_count} day
                        {row.days_count === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn("capitalize", leaveTone[row.status] ?? "bg-muted text-muted-foreground")}
                    >
                      {row.status.toLowerCase()}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
