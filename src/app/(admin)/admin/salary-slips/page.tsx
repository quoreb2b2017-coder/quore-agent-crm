import { FileText, BadgeIndianRupee, Users, CircleAlert, Download, Eye } from "lucide-react";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { requireViewer } from "@/lib/permissions/server";
import { formatInr, formatMonthLabel, initials } from "@/lib/format";
import { monthStartEnd } from "@/lib/attendance-period";
import {
  formatPayDays,
  isPayrollMonthReleased,
  parseMonthParam,
  payrollMonthOptions,
  setupAsOf,
} from "@/lib/payroll";
import { listWatchableEmployees } from "@/lib/queries/admin-dashboard";
import { ensureAutoSalarySlips, loadPayslipsForMonth } from "@/lib/salary-slip-generate";
import { SalarySlipFilters } from "./salary-slip-filters";

const statusTone: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground border-transparent",
  FINALIZED: "bg-info/10 text-info border-info/20",
  PAID: "bg-success/10 text-success border-success/20",
  COMPUTED: "bg-primary/10 text-primary border-primary/20",
  MISSING: "bg-warning/10 text-warning border-warning/20",
};

type SlipRow = {
  id: string;
  employeeId: string;
  fullName: string;
  employeeCode: string;
  period: string;
  officeDays: number | null;
  leaveDays: number | null;
  lopDays: number | null;
  paidDays: number | null;
  gross: number | null;
  net: number | null;
  status: string;
  canDownload: boolean;
};

export default async function AdminSalarySlipsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { ctx, seesAll } = await requireViewer();
  const params = await searchParams;
  const month = parseMonthParam(params.month);
  const requestedEmployee = Array.isArray(params.employee) ? params.employee[0] : params.employee;
  const supabase = await createClient();

  await ensureAutoSalarySlips(ctx.employeeId);

  if (!seesAll) {
    const months = payrollMonthOptions(12).filter(
      (period) => isPayrollMonthReleased(period)
    );
    const [{ data: slips }, { data: records }, { data: employee }] = await Promise.all([
      supabase
        .from("salary_slips")
        .select("id, period_month, period_year, net_amount, gross_amount, status, deductions")
        .eq("employee_id", ctx.employeeId)
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false }),
      supabase
        .from("salary_records")
        .select("employee_id, effective_from, base_salary, pay_frequency, components")
        .eq("employee_id", ctx.employeeId)
        .order("effective_from", { ascending: false }),
      supabase.from("employees").select("salary").eq("id", ctx.employeeId).maybeSingle(),
    ]);
    const live = await loadPayslipsForMonth({
      month: months[0] ?? month,
      employeeIds: [ctx.employeeId],
      persist: false,
    });
    const liveByPeriod = new Map(live.map((slip) => [slip.month, slip]));
    const stored = new Map(
      (slips ?? []).map((slip) => [
        `${slip.period_year}-${String(slip.period_month).padStart(2, "0")}`,
        slip,
      ])
    );
    const rows: SlipRow[] = months
      .map((period) => {
        const setup = setupAsOf(records ?? [], ctx.employeeId, monthStartEnd(period).end, employee?.salary);
        const saved = stored.get(period);
        const computed = liveByPeriod.get(period);
        const attendance = readAttendance(saved?.deductions, computed);
        const gross = computed?.gross ?? saved?.gross_amount ?? setup?.gross ?? null;
        return {
          id: saved?.id ?? `${ctx.employeeId}-${period}`,
          employeeId: ctx.employeeId,
          fullName: ctx.fullName,
          employeeCode: ctx.employeeCode,
          period,
          officeDays: attendance.officeDays,
          leaveDays: attendance.leaveDays,
          lopDays: attendance.lopDays,
          paidDays: attendance.paidDays,
          gross,
          net: computed?.net ?? saved?.net_amount ?? gross,
          status: saved?.status ?? (setup && isPayrollMonthReleased(period) ? "COMPUTED" : setup ? "COMPUTED" : "MISSING"),
          canDownload: Boolean(setup),
        };
      })
      .filter((row) => row.canDownload || stored.has(row.period));

    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Salary Slips"
          description="Payslips generate on the 10th for the previous month (30-day cycle)."
        />
        <SalarySlipsTable rows={rows} showEmployee={false} />
      </div>
    );
  }

  const watchable = await listWatchableEmployees();
  const watchableIds = watchable.map((employee) => employee.id);
  const [year, monthNumber] = month.split("-").map(Number);

  const [{ data: employees }, { data: slips }] = await Promise.all([
    watchableIds.length
      ? supabase
          .from("employees")
          .select("id, full_name, employee_code, salary")
          .in("id", watchableIds)
          .order("full_name")
      : Promise.resolve({
          data: [] as { id: string; full_name: string; employee_code: string; salary: number | null }[],
        }),
    supabase
      .from("salary_slips")
      .select("id, employee_id, gross_amount, net_amount, status, deductions")
      .eq("period_year", year)
      .eq("period_month", monthNumber),
  ]);

  const options = (employees ?? []).map((employee) => ({
    id: employee.id,
    full_name: employee.full_name,
    employee_code: employee.employee_code,
  }));
  const employeeId =
    requestedEmployee && options.some((employee) => employee.id === requestedEmployee)
      ? requestedEmployee
      : null;
  const people = employeeId
    ? (employees ?? []).filter((employee) => employee.id === employeeId)
    : (employees ?? []);

  const computed = await loadPayslipsForMonth({
    month,
    employeeIds: people.map((person) => person.id),
    persist: isPayrollMonthReleased(month),
    generatedBy: ctx.employeeId,
  });
  const computedById = new Map(computed.map((slip) => [slip.employeeId, slip]));
  const slipByEmployee = new Map((slips ?? []).map((slip) => [slip.employee_id, slip]));

  const rows: SlipRow[] = people.map((employee) => {
    const live = computedById.get(employee.id);
    const stored = slipByEmployee.get(employee.id);
    const attendance = live
      ? {
          officeDays: live.attendance.officeDays,
          leaveDays: live.attendance.paidLeaveDays + live.attendance.unpaidLeaveDays,
          lopDays: live.attendance.lopDays,
          paidDays: live.attendance.paidDays,
        }
      : readAttendance(stored?.deductions, null);
    return {
      id: stored?.id ?? `${employee.id}-${month}`,
      employeeId: employee.id,
      fullName: employee.full_name,
      employeeCode: employee.employee_code,
      period: month,
      officeDays: attendance.officeDays,
      leaveDays: attendance.leaveDays,
      lopDays: attendance.lopDays,
      paidDays: attendance.paidDays,
      gross: live?.gross ?? stored?.gross_amount ?? null,
      net: live?.net ?? stored?.net_amount ?? null,
      status: stored?.status ?? (live ? (isPayrollMonthReleased(month) ? "FINALIZED" : "COMPUTED") : "MISSING"),
      canDownload: Boolean(live),
    };
  });

  const onPayroll = rows.filter((row) => row.gross != null).length;
  const missing = rows.length - onPayroll;
  const monthlyTotal = rows.reduce((sum, row) => sum + (row.net ?? 0), 0);

  const months = payrollMonthOptions();
  if (!months.includes(month)) months.unshift(month);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Salary Slips"
        description={
          employeeId
            ? `Payslip for ${formatMonthLabel(month)}. 30-day cycle; unpaid leave is deducted.`
            : `Team salary report for ${formatMonthLabel(month)}. Slips generate automatically on the 10th.`
        }
        actions={
          onPayroll > 0 ? (
            <Button size="sm" asChild>
              <a
                href={
                  employeeId
                    ? `/api/salary-slips/pdf?employee=${employeeId}&month=${month}`
                    : `/api/salary-slips/pdf?month=${month}`
                }
              >
                <Download className="size-3.5" />
                {employeeId ? "Download PDF" : "Download team PDF"}
              </a>
            </Button>
          ) : undefined
        }
      />
      <SalarySlipFilters
        employees={options}
        employeeId={employeeId}
        month={month}
        months={months}
      />
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label={`Payroll · ${formatMonthLabel(month)}`}
          value={formatInr(monthlyTotal)}
          icon={BadgeIndianRupee}
          tone="success"
        />
        <StatCard label="On payroll" value={onPayroll} icon={Users} hint={`${rows.length} people`} />
        <StatCard
          label="Not set up"
          value={missing}
          icon={CircleAlert}
          tone={missing > 0 ? "warning" : "default"}
        />
      </section>
      <SalarySlipsTable rows={rows} showEmployee />
    </div>
  );
}

function SalarySlipsTable({
  rows,
  showEmployee,
}: {
  rows: SlipRow[];
  showEmployee: boolean;
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={FileText}
              title="No salary slips"
              description="Set up payroll for employees to see slips here."
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {showEmployee ? <TableHead className="pl-5">Employee</TableHead> : null}
                <TableHead className={showEmployee ? undefined : "pl-5"}>Period</TableHead>
                <TableHead>Office</TableHead>
                <TableHead>Leave</TableHead>
                <TableHead>LOP</TableHead>
                <TableHead>Paid days</TableHead>
                <TableHead>Gross</TableHead>
                <TableHead>Net</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-5 text-right">Slip</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/40">
                  {showEmployee ? (
                    <TableCell className="pl-5">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9 rounded-xl">
                          <AvatarFallback className="rounded-xl bg-primary/10 text-[11px] font-semibold text-primary">
                            {initials(row.fullName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">{row.fullName}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {row.employeeCode}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                  ) : null}
                  <TableCell className={showEmployee ? undefined : "pl-5"}>
                    {formatMonthLabel(row.period)}
                  </TableCell>
                  <TableCell className="tabular-nums">{formatDaysCell(row.officeDays)}</TableCell>
                  <TableCell className="tabular-nums">{formatDaysCell(row.leaveDays)}</TableCell>
                  <TableCell className="tabular-nums">{formatDaysCell(row.lopDays)}</TableCell>
                  <TableCell className="tabular-nums">{formatDaysCell(row.paidDays)}</TableCell>
                  <TableCell className="font-medium tabular-nums">{formatInr(row.gross)}</TableCell>
                  <TableCell className="font-semibold tabular-nums">{formatInr(row.net)}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn("font-medium capitalize", statusTone[row.status] ?? "bg-muted")}
                    >
                      {statusLabel(row.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    {row.canDownload ? (
                      <div className="inline-flex items-center gap-2">
                        <Button size="sm" variant="outline" asChild>
                          <a href={slipViewHref(row.employeeId, row.period)}>
                            <Eye className="size-3.5" />
                            View
                          </a>
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <a href={slipPdfHref(row.employeeId, row.period)}>
                            <Download className="size-3.5" />
                            PDF
                          </a>
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">No payroll</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function readAttendance(
  deductions: unknown,
  computed: { attendance: { officeDays: number; paidLeaveDays: number; unpaidLeaveDays: number; lopDays: number; paidDays: number } } | null | undefined
) {
  if (computed) {
    return {
      officeDays: computed.attendance.officeDays,
      leaveDays: computed.attendance.paidLeaveDays + computed.attendance.unpaidLeaveDays,
      lopDays: computed.attendance.lopDays,
      paidDays: computed.attendance.paidDays,
    };
  }
  if (!deductions || typeof deductions !== "object" || Array.isArray(deductions)) {
    return { officeDays: null, leaveDays: null, lopDays: null, paidDays: null };
  }
  const record = deductions as Record<string, unknown>;
  const officeDays = Number(record.officeDays);
  const paidLeave = Number(record.paidLeaveDays);
  const unpaidLeave = Number(record.unpaidLeaveDays);
  const lopDays = Number(record.lopDays);
  const paidDays = Number(record.paidDays);
  return {
    officeDays: Number.isFinite(officeDays) ? officeDays : null,
    leaveDays:
      Number.isFinite(paidLeave) || Number.isFinite(unpaidLeave)
        ? (Number.isFinite(paidLeave) ? paidLeave : 0) + (Number.isFinite(unpaidLeave) ? unpaidLeave : 0)
        : null,
    lopDays: Number.isFinite(lopDays) ? lopDays : null,
    paidDays: Number.isFinite(paidDays) ? paidDays : null,
  };
}

function formatDaysCell(value: number | null) {
  return value == null ? "—" : formatPayDays(value);
}

function slipViewHref(employeeId: string, month: string) {
  const params = new URLSearchParams({ employee: employeeId, month });
  return `/admin/salary-slips/view?${params.toString()}`;
}

function slipPdfHref(employeeId: string, month: string) {
  const params = new URLSearchParams({ employee: employeeId, month });
  return `/api/salary-slips/pdf?${params.toString()}`;
}

function statusLabel(status: string) {
  if (status === "COMPUTED") return "Ready";
  if (status === "MISSING") return "Not set up";
  return status.toLowerCase();
}
