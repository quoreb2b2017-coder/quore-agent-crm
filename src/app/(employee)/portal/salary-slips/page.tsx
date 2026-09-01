import { Wallet, Download, Eye } from "lucide-react";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatInr, formatMonthLabel } from "@/lib/format";
import { monthStartEnd } from "@/lib/attendance-period";
import {
  autoGeneratePayrollMonth,
  formatPayDays,
  isPayrollMonthReleased,
  payrollMonthOptions,
  setupAsOf,
} from "@/lib/payroll";
import { ensureAutoSalarySlips, loadPayslipsForMonth } from "@/lib/salary-slip-generate";

const statusTone: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground border-transparent",
  FINALIZED: "bg-info/10 text-info border-info/20",
  PAID: "bg-success/10 text-success border-success/20",
  COMPUTED: "bg-primary/10 text-primary border-primary/20",
  MISSING: "bg-warning/10 text-warning border-warning/20",
};

export default async function MySalarySlipsPage() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return null;

  await ensureAutoSalarySlips(ctx.employeeId);

  const supabase = await createClient();
  const months = payrollMonthOptions(12).filter((period) => isPayrollMonthReleased(period));
  const released = autoGeneratePayrollMonth();
  const [{ data: slips }, { data: records }, { data: employee }, liveRows] = await Promise.all([
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
    loadPayslipsForMonth({
      month: released,
      employeeIds: [ctx.employeeId],
      persist: false,
    }),
  ]);

  const stored = new Map(
    (slips ?? []).map((slip) => [
      `${slip.period_year}-${String(slip.period_month).padStart(2, "0")}`,
      slip,
    ])
  );
  const live = liveRows[0] ?? null;

  const rows = months.map((period) => {
    const setup = setupAsOf(records ?? [], ctx.employeeId, monthStartEnd(period).end, employee?.salary);
    const saved = stored.get(period);
    const computed = period === released ? live : null;
    const attendance = readAttendance(saved?.deductions, computed);
    const gross = computed?.gross ?? saved?.gross_amount ?? setup?.gross ?? null;
    return {
      period,
      officeDays: attendance.officeDays,
      leaveDays: attendance.leaveDays,
      lopDays: attendance.lopDays,
      net: computed?.net ?? saved?.net_amount ?? gross,
      status: saved?.status ?? (setup ? "FINALIZED" : "MISSING"),
      canDownload: Boolean(setup || computed || saved),
    };
  });
  const visible = rows.filter((row) => row.canDownload);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Salary Slips"
        description="Payslips generate on the 10th for the previous month. Unpaid leave is deducted from net pay."
      />
      <Card>
        <CardContent>
          {visible.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No salary slips yet"
              description="Slips become available on the 10th after payroll is set up for your account."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Office</TableHead>
                  <TableHead>Leave</TableHead>
                  <TableHead>LOP</TableHead>
                  <TableHead>Net Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Slip</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => (
                  <TableRow key={row.period}>
                    <TableCell>{formatMonthLabel(row.period)}</TableCell>
                    <TableCell className="tabular-nums">
                      {row.officeDays == null ? "—" : formatPayDays(row.officeDays)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.leaveDays == null ? "—" : formatPayDays(row.leaveDays)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.lopDays == null ? "—" : formatPayDays(row.lopDays)}
                    </TableCell>
                    <TableCell className="tabular-nums">{formatInr(row.net)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn("font-medium capitalize", statusTone[row.status] ?? "bg-muted")}
                      >
                        {row.status === "COMPUTED" ? "Ready" : row.status.toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {row.canDownload ? (
                        <div className="inline-flex items-center gap-2">
                          <Button size="sm" variant="outline" asChild>
                            <a href={`/portal/salary-slips/view?month=${row.period}`}>
                              <Eye className="size-3.5" />
                              View
                            </a>
                          </Button>
                          <Button size="sm" variant="outline" asChild>
                            <a
                              href={`/api/salary-slips/pdf?employee=${ctx.employeeId}&month=${row.period}`}
                            >
                              <Download className="size-3.5" />
                              PDF
                            </a>
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
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

function readAttendance(
  deductions: unknown,
  computed: {
    attendance: {
      officeDays: number;
      paidLeaveDays: number;
      unpaidLeaveDays: number;
      lopDays: number;
    };
  } | null
) {
  if (computed) {
    return {
      officeDays: computed.attendance.officeDays,
      leaveDays: computed.attendance.paidLeaveDays + computed.attendance.unpaidLeaveDays,
      lopDays: computed.attendance.lopDays,
    };
  }
  if (!deductions || typeof deductions !== "object" || Array.isArray(deductions)) {
    return { officeDays: null, leaveDays: null, lopDays: null };
  }
  const record = deductions as Record<string, unknown>;
  const officeDays = Number(record.officeDays);
  const paidLeave = Number(record.paidLeaveDays);
  const unpaidLeave = Number(record.unpaidLeaveDays);
  const lopDays = Number(record.lopDays);
  return {
    officeDays: Number.isFinite(officeDays) ? officeDays : null,
    leaveDays:
      Number.isFinite(paidLeave) || Number.isFinite(unpaidLeave)
        ? (Number.isFinite(paidLeave) ? paidLeave : 0) + (Number.isFinite(unpaidLeave) ? unpaidLeave : 0)
        : null,
    lopDays: Number.isFinite(lopDays) ? lopDays : null,
  };
}
