import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MeterRow } from "@/components/dashboard/mix-bar";
import { KpiStrip, Panel, Pill, SegmentBar } from "@/components/wt/panel";
import { PaletteButton } from "@/components/wt/palette-button";
import { loadApprovals } from "@/lib/queries/approvals";
import { loadComplianceSummary } from "@/lib/compliance/summary";
import { federalHolidays } from "@/lib/federal-holidays";
import { isSuperAdmin } from "@/lib/permissions/roles";
import { StaffDashboard } from "@/components/dashboards/staff-dashboard";
import { requireViewer } from "@/lib/permissions/server";
import { trustedNowDate } from "@/lib/clock-anchor";
import { formatMonthLabel, greetingForNow, INDIA_TIME_ZONE, SHIFT_WINDOW_IST_LABEL, todayIso } from "@/lib/format";
import { AdminLogoutButton } from "@/components/attendance/admin-logout-button";
import { getAdminDashboardData } from "@/lib/queries/admin-dashboard";
import { sweepIdleSessions } from "@/lib/presence-server";
import { getEmployeeDashboardBundle } from "@/lib/queries/employee-status";
import { isUuid, monthStartEnd } from "@/lib/attendance-period";
import { MonthCalendar } from "@/components/attendance/month-calendar";
import { MyActivityLog } from "@/components/activity/my-activity-log";
import { buildActivityDays } from "@/lib/queries/shift-activity";
import { getProductivityReport } from "@/lib/queries/productivity-report";
import { EmployeeWatchSelect } from "./employee-watch-select";
import { TeamTodayReport } from "./team-today-report";
import { MeetingRequests } from "./meeting-requests";

export async function AdminDashboardBody({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { ctx, seesAll } = await requireViewer();
  const todayLabel = trustedNowDate().toLocaleDateString("en-IN", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: INDIA_TIME_ZONE,
  });

  if (!seesAll) {
    const monthKey = todayIso().slice(0, 7);
    const bounds = monthStartEnd(monthKey);
    const [{ sessionState, commonData }, calendarRow, activityDays] = await Promise.all([
      getEmployeeDashboardBundle(ctx.employeeId),
      getProductivityReport(
        [{ id: ctx.employeeId, full_name: ctx.fullName, employee_code: ctx.employeeCode }],
        bounds.start,
        bounds.end
      ).then((rows) => rows[0]),
      buildActivityDays(
        {
          id: ctx.employeeId,
          fullName: ctx.fullName,
          employeeCode: ctx.employeeCode,
        },
        30
      ),
    ]);

    return (
      <>
        <StaffDashboard
          compact
          greeting={greetingForNow()}
          firstName={ctx.fullName.split(" ")[0] ?? "there"}
          roleLabel={ctx.roleDisplayName}
          subtitle={todayLabel}
          sessionState={sessionState}
          commonData={commonData}
          activity={<MyActivityLog days={activityDays} embedded />}
        />
        {calendarRow ? (
          <div className="pt-4 pb-6">
            <MonthCalendar
              title={`${formatMonthLabel(monthKey)} — ${ctx.fullName}`}
              start={bounds.start}
              end={bounds.end}
              days={calendarRow.days}
              trackingStart={calendarRow.trackingStart}
              prevHref={`/admin/productivity?view=monthly&employee=${ctx.employeeId}&month=${shiftMonth(monthKey, -1)}`}
              nextHref={`/admin/productivity?view=monthly&employee=${ctx.employeeId}&month=${shiftMonth(monthKey, 1)}`}
            />
          </div>
        ) : null}
      </>
    );
  }

  const requested = Array.isArray(searchParams.employee) ? searchParams.employee[0] : searchParams.employee;
  const requestedId = requested && isUuid(requested) ? requested : null;

  await sweepIdleSessions();
  const dashboard = await getAdminDashboardData();
  const { stats, employees, teamReport, pendingMeetings } = dashboard;

  const selected = employees.find((employee) => employee.id === requestedId) ?? null;
  const monthKey = todayIso().slice(0, 7);
  const monthBounds = monthStartEnd(monthKey);
  if (selected) {
    const [{ sessionState, commonData }, calendarRow, activityDays] = await Promise.all([
      getEmployeeDashboardBundle(selected.id),
      getProductivityReport(
        [{ id: selected.id, full_name: selected.full_name, employee_code: selected.employee_code }],
        monthBounds.start,
        monthBounds.end
      ).then((rows) => rows[0]),
      buildActivityDays(
        {
          id: selected.id,
          fullName: selected.full_name,
          employeeCode: selected.employee_code,
        },
        30
      ),
    ]);
    const first = selected.full_name.split(" ")[0] ?? selected.full_name;

    return (
      <>
        <StaffDashboard
          compact
          readOnly
          greeting={greetingForNow()}
          firstName={first}
          roleLabel={selected.employee_code}
          subtitle={todayLabel}
          sessionState={sessionState}
          commonData={commonData}
          sessionTitle={`${selected.full_name}'s session`}
          sessionHint="Same view the employee sees · view only"
          toolbar={
            <div className="flex items-center gap-2 sm:w-auto">
              {sessionState.isClockedIn ? (
                <AdminLogoutButton employeeId={selected.id} employeeName={selected.full_name} />
              ) : null}
              <div className="sm:w-64">
                <EmployeeWatchSelect employees={employees} employeeId={selected.id} />
              </div>
            </div>
          }
          activity={
            <MyActivityLog
              days={activityDays}
              embedded
              title={`${first}'s activity`}
              subtitle="Last 30 days · view only"
            />
          }
        />
        {pendingMeetings.length > 0 ? (
          <div className="border-x border-b bg-card px-4 py-3">
            <MeetingRequests requests={pendingMeetings} />
          </div>
        ) : null}
        {calendarRow ? (
          <div className="pt-4 pb-6">
            <MonthCalendar
              title={`${formatMonthLabel(monthKey)} — ${calendarRow.employee.full_name}`}
              start={monthBounds.start}
              end={monthBounds.end}
              days={calendarRow.days}
              trackingStart={calendarRow.trackingStart}
              prevHref={`/admin/productivity?view=monthly&employee=${calendarRow.employee.id}&month=${shiftMonth(monthKey, -1)}`}
              nextHref={`/admin/productivity?view=monthly&employee=${calendarRow.employee.id}&month=${shiftMonth(monthKey, 1)}`}
            />
          </div>
        ) : null}
      </>
    );
  }

  const firstName = ctx.fullName.split(" ")[0] ?? "Admin";
  const attendancePct =
    stats.totalEmployees > 0 ? Math.round((stats.todaysAttendance / stats.totalEmployees) * 100) : 0;
  const hourScale = Math.max(8, stats.totalWorkingHours, stats.totalBreakHours, stats.totalIdleHours, 0.1);
  const superAdmin = isSuperAdmin(ctx.roleKey);
  const [approvals, compliance] = await Promise.all([
    loadApprovals(ctx),
    superAdmin ? loadComplianceSummary() : Promise.resolve(null),
  ]);
  const upcoming = upcomingDates(todayIso());
  const decisions = approvals.counts.ALL;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="wt-eyebrow mb-1">{todayLabel} · shift {SHIFT_WINDOW_IST_LABEL}</p>
          <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.015em]">
            {greetingForNow()}, {firstName}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {decisions > 0
              ? `${decisions} ${decisions === 1 ? "thing needs" : "things need"} your decision.`
              : "Nothing is waiting for your decision."}{" "}
            {stats.onlineEmployees} of {stats.totalEmployees} people are online.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PaletteButton />
          <Button asChild className="h-9 bg-ink text-white hover:bg-ink/90">
            <Link href="/admin/approvals">Review approvals</Link>
          </Button>
        </div>
      </div>

      <KpiStrip
        items={[
          { label: "Team", value: stats.totalEmployees, sub: `${stats.onlineEmployees} online now`, subTone: stats.onlineEmployees ? "success" : "neutral" },
          {
            label: "Present today",
            value: stats.todaysAttendance,
            sub: `${attendancePct}% attendance${stats.lateEmployees ? ` · ${stats.lateEmployees} late` : ""}`,
            subTone: stats.lateEmployees ? "warning" : "neutral",
          },
          { label: "On break", value: stats.onBreakEmployees, sub: `${stats.totalBreakHours}h break today` },
          { label: "Pending approvals", value: decisions, sub: decisions ? "Waiting for you" : "All clear", subTone: decisions ? "warning" : "success", href: "/admin/approvals" },
          ...(compliance
            ? [
                {
                  label: "Open security actions",
                  value: compliance.openActions,
                  sub: `${compliance.criticalHighActions} critical or high`,
                  subTone: (compliance.criticalHighActions ? "danger" : "neutral") as "danger" | "neutral",
                  href: "/admin/compliance/actions",
                },
              ]
            : []),
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Panel
          id="roster"
          title="Live shift roster"
          description="Everyone on today's shift. Pick a person to open their dashboard."
          actions={
            <div className="w-56">
              <EmployeeWatchSelect employees={employees} employeeId={null} />
            </div>
          }
          bodyClassName="flex flex-col"
        >
          <MeetingRequests requests={pendingMeetings} />
          <TeamTodayReport rows={teamReport} attendanceDate={todayIso()} />
        </Panel>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel
            id="approvals"
            title={<>Your approvals <span className="font-normal text-muted-foreground">· {decisions}</span></>}
            actions={<Link href="/admin/approvals" className="text-[13px] font-medium text-primary hover:underline">Open inbox</Link>}
          >
            {approvals.items.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">Nothing is waiting for you.</p>
            ) : (
              <ul className="divide-y">
                {approvals.items.slice(0, 4).map((item) => (
                  <li key={item.id}>
                    <Link href="/admin/approvals" className="flex items-center gap-3 px-5 py-3 transition hover:bg-muted/40">
                      <Pill tone={APPROVAL_TONE[item.kind]} className="min-w-[74px] justify-center text-[11px] tracking-wide uppercase">
                        {item.kind.toLowerCase()}
                      </Pill>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.title}</span>
                        <span className="block truncate text-[12.5px] text-muted-foreground">{item.subtitle}</span>
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {compliance ? (
            <section aria-labelledby="posture-title" className="flex flex-col gap-4 rounded-xl bg-ink p-5 text-ink-foreground">
              <div className="flex items-center justify-between gap-3">
                <h2 id="posture-title" className="text-[15px] font-semibold text-white">Security &amp; Compliance posture</h2>
                <span className="font-mono text-[11.5px] text-ink-muted">ISO 27001 · SOC 2</span>
              </div>
              <p className="flex items-baseline gap-2.5">
                <span className="text-[34px] leading-none font-semibold tracking-[-0.02em] text-white">
                  {compliance.operating}
                  <span className="text-lg text-ink-muted"> / {compliance.totalControls}</span>
                </span>
                <span className="text-[13px]">controls operating with reviewed evidence</span>
              </p>
              <SegmentBar
                dark
                label="Control status breakdown"
                segments={compliance.byStatus.map((s) => ({ label: s.label, count: s.count, color: s.color }))}
              />
              {compliance.criticalHighActions > 0 ? (
                <div className="flex gap-2.5 rounded-lg border border-ink-border bg-ink-panel p-3 text-[12.5px] leading-relaxed">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#f97066]" aria-hidden />
                  <span>
                    <b className="font-semibold text-white">
                      {compliance.criticalHighActions} critical or high {compliance.criticalHighActions === 1 ? "action is" : "actions are"} open.
                    </b>{" "}
                    {compliance.pendingEvidence} evidence {compliance.pendingEvidence === 1 ? "item is" : "items are"} waiting for review.
                  </span>
                </div>
              ) : null}
              <Link href="/admin/compliance" className="self-start text-[13px] font-medium text-mint hover:underline">
                Open the compliance workspace →
              </Link>
            </section>
          ) : null}

          <Panel id="hours" title="Today's hours" description="Team working, break and idle time" bodyClassName="flex flex-col gap-2 p-4">
            <MeterRow compact tone="success" label="Working" value={stats.totalWorkingHours} max={hourScale} barClass="bg-success" />
            <MeterRow compact tone="warning" label="Break" value={stats.totalBreakHours} max={hourScale} barClass="bg-warning" />
            <MeterRow compact tone="info" label="Idle" value={stats.totalIdleHours} max={hourScale} barClass="bg-info" />
          </Panel>

          <Panel id="upcoming" title="Coming up">
            <ul className="divide-y">
              {upcoming.map((u) => (
                <li key={`${u.date}-${u.title}`} className="flex items-center gap-3.5 px-5 py-2.5">
                  <span className="w-11 shrink-0 rounded-lg border py-1 text-center leading-tight">
                    <span className="block text-[10.5px] font-semibold text-primary uppercase">{u.month}</span>
                    <span className="text-base font-semibold">{u.day}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{u.title}</span>
                    <span className="block text-[12.5px] text-muted-foreground">{u.meta}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

const APPROVAL_TONE = { MEETING: "info", LEAVE: "warning", EVIDENCE: "brand", EXCEPTION: "danger" } as const;

/** Next US federal holidays plus the 1st-of-month payslip run. */
function upcomingDates(today: string) {
  const year = Number(today.slice(0, 4));
  const fmt = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return {
      month: d.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }),
      day: String(d.getUTCDate()),
    };
  };
  const list: { date: string; title: string; meta: string; month: string; day: string }[] = [];
  const holidays = [...federalHolidays(year), ...federalHolidays(year + 1)].filter((h) => h.date >= today).slice(0, 2);
  for (const h of holidays) list.push({ date: h.date, title: h.name, meta: "US holiday · client offices closed", ...fmt(h.date) });
  const [y, m] = today.split("-").map(Number);
  const nextRun = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  list.push({ date: nextRun, title: "Payslips generated", meta: "Runs automatically for the month just ended", ...fmt(nextRun) });
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

function shiftMonth(yyyyMm: string, delta: number) {
  const [year, month] = yyyyMm.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}
