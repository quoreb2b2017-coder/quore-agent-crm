import Link from "next/link";
import { Radio, Wallet, CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ProductivityChart } from "@/components/dashboard/productivity-chart";
import { SheetKpi as KpiCell } from "@/components/dashboard/sheet-kpi";
import { Panel } from "@/components/wt/panel";
import { AttendanceSheet } from "@/components/attendance/attendance-sheet";
import {
  formatBreakDuration,
  formatDuration,
  formatExcess,
  formatInr,
  formatIsoDate,
  formatTime,
} from "@/lib/format";
import {
  BREAK_POLICY_LABEL,
  PRODUCTIVE_HOURS_LABEL,
  productiveTargetSeconds,
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
  employeeName,
  data,
  showPayroll = true,
}: {
  employeeId: string;
  employeeName: string;
  data: EmployeeHistoryPayload;
  showPayroll?: boolean;
}) {
  const hasExcess = data.excessBreakSeconds > 0;
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 border bg-card xl:grid-cols-4">
        <KpiCell
          label="Present (30 days)"
          value={data.presentDays}
          valueClassName="text-success"
          hint={data.leaveDays > 0 ? `${data.leaveDays} on leave` : "Shift days marked present"}
        />
        <KpiCell
          label="Productivity today"
          value={`${data.todayProductivityPct}%`}
          valueClassName="text-info"
          hint={`vs ${PRODUCTIVE_HOURS_LABEL}`}
          progress={Math.min(100, data.todayProductivityPct)}
        />
        <KpiCell
          label="Productive (30 days)"
          value={formatDuration(data.activeSeconds)}
          valueClassName="text-success"
          hint={`Today ${formatDuration(data.todayActiveSeconds)} of ${formatDuration(productiveTargetSeconds(data.attendance.find((row) => row.attendance_date === data.today)?.status))}`}
        />
        <KpiCell
          label="Breaks (30 days)"
          value={formatBreakDuration(data.breakSeconds)}
          valueClassName={hasExcess ? "text-destructive" : undefined}
          hint={hasExcess ? `Excess break +${formatExcess(data.excessBreakSeconds)}` : BREAK_POLICY_LABEL}
          hintClassName={hasExcess ? "font-medium text-destructive" : undefined}
        />
      </dl>

      <AttendanceSheet
        employeeId={employeeId}
        employeeName={employeeName}
        today={data.today}
        attendance={data.sheetAttendance}
        excessByDate={data.sheetExcessByDate}
        canEdit
        showTimeLeft
      />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Panel
          id="productivity"
          className="rounded-none lg:col-span-3"
          bodyClassName="p-4"
          title="Productivity — last 7 shifts"
          description={`Productive hours vs the ${PRODUCTIVE_HOURS_LABEL} target`}
        >
          <ProductivityChart data={data.chartData} />
        </Panel>

        <Panel
          id="today-activity"
          className="rounded-none lg:col-span-2"
          title="Today's activity"
          description={`Login, logout, breaks, washroom (${data.todayWashroomVisits} ${data.todayWashroomVisits === 1 ? "visit" : "visits"}), and meetings this shift`}
        >
          {data.timeline.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={Radio}
                title="No activity yet today"
                description="Clock-in and breaks will appear here."
              />
            </div>
          ) : (
            <ol className="max-h-72 divide-y overflow-y-auto">
              {data.timeline.map((event, index) => (
                <li
                  key={`${event.time}-${index}`}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 px-5 py-2 text-[13px]"
                >
                  <span className="font-medium">{event.label}</span>
                  <span className="whitespace-nowrap tabular-nums text-muted-foreground">
                    {formatTime(event.time)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </section>

      <section className={showPayroll ? "grid grid-cols-1 gap-4 lg:grid-cols-2" : "grid grid-cols-1"}>
        {showPayroll ? (
          <Panel
            id="payroll"
            className="rounded-none"
            bodyClassName="p-5"
            title="Payroll"
            description="Current salary setup"
            actions={
              <Button variant="outline" size="sm" className="rounded-sm" asChild>
                <Link href={`/admin/salary-slips?employee=${employeeId}`}>
                  <Wallet className="size-3.5" />
                  Salary slip
                </Link>
              </Button>
            }
          >
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
          </Panel>
        ) : null}

        <Panel id="leave" className="rounded-none" title="Leave" description="Recent leave requests">
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
                    className={cn("rounded-sm capitalize", leaveTone[row.status] ?? "bg-muted text-muted-foreground")}
                  >
                    {row.status.toLowerCase()}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>
    </div>
  );
}
