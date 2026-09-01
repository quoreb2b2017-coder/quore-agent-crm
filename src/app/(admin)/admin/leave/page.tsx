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
import { calendarDateIsoIst, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isUuid } from "@/lib/attendance-period";
import { listWatchableEmployees } from "@/lib/queries/admin-dashboard";
import { getPaidLeaveQuota } from "@/lib/queries/leave";
import { LeaveQuotaPanel } from "@/components/leave/leave-quota-panel";
import { LeaveAdminActions } from "./leave-actions";
import { LeaveFilters } from "./leave-filters";
import { requireViewer } from "@/lib/permissions/server";
import { ApplyLeaveDialog } from "@/app/(employee)/portal/leave/apply-leave-dialog";

const statusTone: Record<string, string> = {
  PENDING: "bg-warning/10 text-warning border-warning/20",
  APPROVED: "bg-success/10 text-success border-success/20",
  REJECTED: "bg-destructive/10 text-destructive border-destructive/20",
  CANCELLED: "bg-muted text-muted-foreground border-transparent",
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
  const year = Number(calendarDateIsoIst().slice(0, 4));

  const employees = seesAll ? await listWatchableEmployees() : [];
  const employeeId =
    requestedId && employees.some((employee) => employee.id === requestedId) ? requestedId : null;

  let requestsQuery = supabase
    .from("leave_requests")
    .select("id, employee_id, leave_type_id, start_date, end_date, days_count, status, reason")
    .order("created_at", { ascending: false })
    .limit(200);
  if (!seesAll) requestsQuery = requestsQuery.eq("employee_id", ctx.employeeId);
  else if (employeeId) requestsQuery = requestsQuery.eq("employee_id", employeeId);

  const quotaIds = seesAll
    ? employeeId
      ? [employeeId]
      : employees.map((employee) => employee.id)
    : [ctx.employeeId];
  const people = Math.max(1, quotaIds.length);
  const selectedName = employees.find((employee) => employee.id === employeeId)?.full_name;

  const [{ data: requests }, { data: leaveTypes }, quota] = await Promise.all([
    requestsQuery,
    supabase.from("leave_types").select("id, name, is_paid").order("name"),
    getPaidLeaveQuota({ employeeIds: quotaIds, year, people }),
  ]);

  const employeeIds = Array.from(new Set((requests ?? []).map((row) => row.employee_id)));
  const { data: namedEmployees } =
    employeeIds.length > 0
      ? await supabase.from("employees").select("id, full_name").in("id", employeeIds)
      : { data: [] };

  const nameById = new Map((namedEmployees ?? []).map((row) => [row.id, row.full_name]));
  const typeById = new Map((leaveTypes ?? []).map((row) => [row.id, row]));
  const rows = requests ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Leave Management"
        description={
          seesAll
            ? employeeId
              ? `Paid leave balance and requests for ${selectedName}.`
              : "Team paid leave quota, requests, and approvals."
            : "18 paid days each year. Weekends stay week off and are not deducted."
        }
        actions={seesAll ? undefined : <ApplyLeaveDialog leaveTypes={leaveTypes ?? []} />}
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

      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={CalendarDays} title="No leave requests yet" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Pay</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                  {seesAll ? <TableHead className="text-right">Action</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{nameById.get(row.employee_id) ?? "—"}</TableCell>
                    <TableCell>{typeById.get(row.leave_type_id)?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-medium",
                          typeById.get(row.leave_type_id)?.is_paid
                            ? "border-success/20 bg-success/10 text-success"
                            : "border-warning/20 bg-warning/10 text-warning"
                        )}
                      >
                        {typeById.get(row.leave_type_id)?.is_paid ? "Paid" : "Unpaid"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {formatDate(row.start_date)} – {formatDate(row.end_date)}
                    </TableCell>
                    <TableCell>{row.days_count}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("font-medium", statusTone[row.status])}>
                        {row.status}
                      </Badge>
                    </TableCell>
                    {seesAll ? (
                      <TableCell className="text-right">
                        <LeaveAdminActions
                          leaveTypes={leaveTypes ?? []}
                          request={{
                            id: row.id,
                            leaveTypeId: row.leave_type_id,
                            startDate: row.start_date,
                            endDate: row.end_date,
                            reason: row.reason,
                            status: row.status,
                          }}
                        />
                      </TableCell>
                    ) : null}
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
