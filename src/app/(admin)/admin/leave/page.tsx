import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
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
import { formatDate, todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isUuid } from "@/lib/attendance-period";
import { listWatchableEmployees } from "@/lib/queries/admin-dashboard";
import { isUndecidedLeaveType } from "@/lib/leave";
import { getLeaveBalanceRows, getPaidLeaveQuota, listLeaveHistory } from "@/lib/queries/leave";
import { LeaveBalances } from "./leave-balances";
import { LeaveQuotaPanel } from "@/components/leave/leave-quota-panel";
import { LeaveAdminActions } from "./leave-actions";
import { LeaveFilters } from "./leave-filters";
import { requireViewer } from "@/lib/permissions/server";
import { ApplyLeaveDialog } from "@/app/(employee)/portal/leave/apply-leave-dialog";
import { LeaveReasonTip } from "@/components/leave/leave-reason-tip";

const statusTone: Record<string, string> = {
  PENDING: "bg-warning/10 text-warning border-warning/20",
  APPROVED: "bg-success/10 text-success border-success/20",
  REJECTED: "bg-destructive/10 text-destructive border-destructive/20",
  CANCELLED: "bg-muted text-muted-foreground border-transparent",
  ON_LEAVE: "bg-info/10 text-info border-info/20",
};

export default async function AdminLeavePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { ctx, seesAll } = await requireViewer();
  const params = await searchParams;
  const requested = Array.isArray(params.employee) ? params.employee[0] : params.employee;
  const requestedId = requested && isUuid(requested) ? requested : null;
  const supabase = await createClient();
  const year = Number(todayIso().slice(0, 4));

  const employees = seesAll ? await listWatchableEmployees() : [];
  const employeeId =
    requestedId && employees.some((employee) => employee.id === requestedId) ? requestedId : null;

  const quotaIds = seesAll
    ? employeeId
      ? [employeeId]
      : employees.map((employee) => employee.id)
    : [ctx.employeeId];
  const people = Math.max(1, quotaIds.length);
  const selectedName = employees.find((employee) => employee.id === employeeId)?.full_name;

  const [{ data: leaveTypes }, quota, balanceRows, history] = await Promise.all([
    supabase.from("leave_types").select("id, name, is_paid").order("name"),
    getPaidLeaveQuota({ employeeIds: quotaIds, year, people }),
    seesAll ? getLeaveBalanceRows(employeeId ? employees.filter((person) => person.id === employeeId) : employees, year) : Promise.resolve([]),
    listLeaveHistory(quotaIds, year),
  ]);

  const nameById = new Map(employees.map((row) => [row.id, row.full_name]));
  const typeById = new Map((leaveTypes ?? []).map((row) => [row.id, row]));
  const assignableTypes = (leaveTypes ?? []).filter((row) => !isUndecidedLeaveType(row.name));
  const rows = history;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Leave Management"
        description={
          seesAll
            ? employeeId
              ? `Paid leave balance and requests for ${selectedName}.`
              : "Team paid leave quota, requests, and approvals."
            : `${quota.available} paid days this year. Weekends stay week off and are not deducted.`
        }
        actions={seesAll ? undefined : <ApplyLeaveDialog />}
      />

      <LeaveQuotaPanel
        year={year}
        available={quota.available}
        used={quota.used}
        remaining={quota.remaining}
        pending={quota.pending}
        peopleLabel={
          seesAll && !employeeId
            ? `${people} employees · ${quota.available} days team pool`
            : `${selectedName ?? ctx.fullName} · personal quota`
        }
        filter={
          seesAll ? <LeaveFilters employees={employees} employeeId={employeeId} /> : undefined
        }
      />

      {seesAll ? (
        <Card className="gap-0 overflow-hidden py-0">
          <CardContent className="p-0">
            <LeaveBalances year={year} rows={balanceRows} single={!!employeeId} />
          </CardContent>
        </Card>
      ) : null}

      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={CalendarDays}
                title={employeeId ? "No leave taken this year" : "No leave taken yet"}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Pay</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                  {seesAll ? <TableHead className="text-right">Action</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const type = row.leaveTypeId ? typeById.get(row.leaveTypeId) : undefined;
                  const decided = type && !isUndecidedLeaveType(type.name);
                  return (
                  <TableRow key={row.key}>
                    <TableCell>
                      {seesAll ? (
                        <Link
                          href={`/admin/leave?employee=${row.employeeId}`}
                          className="font-medium underline-offset-2 hover:text-primary hover:underline"
                        >
                          {nameById.get(row.employeeId) ?? "—"}
                        </Link>
                      ) : (
                        nameById.get(row.employeeId) ?? "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <LeaveReasonTip subject={row.subject} reason={row.reason}>
                        <span className="block max-w-xs">
                          <span className="block font-medium">{row.subject || "—"}</span>
                          {row.reason && row.reason !== row.subject ? (
                            <span className="line-clamp-2 text-xs text-muted-foreground">{row.reason}</span>
                          ) : null}
                        </span>
                      </LeaveReasonTip>
                    </TableCell>
                    <TableCell>{decided ? type.name : row.requestId ? "Not decided" : "Marked"}</TableCell>
                    <TableCell>
                      {decided ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-medium",
                            type.is_paid
                              ? "border-success/20 bg-success/10 text-success"
                              : "border-warning/20 bg-warning/10 text-warning"
                          )}
                        >
                          {type.is_paid ? "Paid" : "Unpaid"}
                        </Badge>
                      ) : row.requestId ? (
                        <Badge variant="outline" className="font-medium">
                          Pending
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {formatDate(row.startDate)}
                      {row.endDate !== row.startDate ? ` – ${formatDate(row.endDate)}` : ""}
                    </TableCell>
                    <TableCell>{row.days}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("font-medium", statusTone[row.status])}>
                        {row.status === "ON_LEAVE" ? "Taken" : row.status}
                      </Badge>
                    </TableCell>
                    {seesAll ? (
                      <TableCell className="text-right">
                        {row.requestId ? (
                          <LeaveAdminActions
                            leaveTypes={assignableTypes}
                            request={{
                              id: row.requestId,
                              leaveTypeId: decided && row.leaveTypeId ? row.leaveTypeId : "",
                              startDate: row.startDate,
                              endDate: row.endDate,
                              subject: row.subject,
                              reason: row.reason === row.subject ? "" : row.reason,
                              status: row.status,
                            }}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">Attendance</span>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
