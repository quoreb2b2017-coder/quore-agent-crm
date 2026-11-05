import Link from "next/link";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { PageHeader } from "@/components/dashboard/page-header";
import { todayIso } from "@/lib/format";
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
import { LeaveHistorySheet } from "@/components/leave/leave-history-sheet";

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

  const personById = new Map(employees.map((row) => [row.id, row]));
  const assignableTypes = (leaveTypes ?? []).filter((row) => !isUndecidedLeaveType(row.name));
  const rows = history;

  return (
    <div className="flex flex-col gap-4">
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

      <LeaveHistorySheet
        rows={rows}
        leaveTypes={leaveTypes ?? []}
        emptyTitle={employeeId ? "No leave taken this year" : "No leave taken yet"}
        employee={
          seesAll
            ? (row) => ({
                name: (
                  <Link
                    href={`/admin/leave?employee=${row.employeeId}`}
                    className="font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    {personById.get(row.employeeId)?.full_name ?? "—"}
                  </Link>
                ),
                code: personById.get(row.employeeId)?.employee_code ?? "—",
              })
            : undefined
        }
        action={
          seesAll
            ? (row, decidedTypeId) =>
                row.requestId ? (
                  <LeaveAdminActions
                    leaveTypes={assignableTypes}
                    request={{
                      id: row.requestId,
                      leaveTypeId: decidedTypeId,
                      startDate: row.startDate,
                      endDate: row.endDate,
                      subject: row.subject,
                      reason: row.reason === row.subject ? "" : row.reason,
                      status: row.status,
                    }}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">Attendance</span>
                )
            : undefined
        }
      />

      {seesAll ? <LeaveBalances year={year} rows={balanceRows} single={!!employeeId} /> : null}
    </div>
  );
}
