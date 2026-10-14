import { CalendarDays } from "lucide-react";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
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
import { isUndecidedLeaveType } from "@/lib/leave";
import { getPaidLeaveQuota, listLeaveHistory } from "@/lib/queries/leave";
import { LeaveQuotaPanel } from "@/components/leave/leave-quota-panel";
import { ApplyLeaveDialog } from "./apply-leave-dialog";
import { LeaveReasonTip } from "@/components/leave/leave-reason-tip";

const statusTone: Record<string, string> = {
  PENDING: "bg-warning/10 text-warning border-warning/20",
  APPROVED: "bg-success/10 text-success border-success/20",
  REJECTED: "bg-destructive/10 text-destructive border-destructive/20",
  CANCELLED: "bg-muted text-muted-foreground border-transparent",
  ON_LEAVE: "bg-info/10 text-info border-info/20",
};

export default async function MyLeavePage() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return null;

  const supabase = await createClient();
  const year = Number(todayIso().slice(0, 4));

  const [{ data: leaveTypes }, quota, history] = await Promise.all([
    supabase.from("leave_types").select("id, name, is_paid").order("name"),
    getPaidLeaveQuota({ employeeIds: [ctx.employeeId], year, people: 1 }),
    listLeaveHistory([ctx.employeeId], year),
  ]);

  const typeById = new Map((leaveTypes ?? []).map((t) => [t.id, t]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Leave"
        description={`Used ${quota.used} of ${quota.available} days. ${quota.remaining} left. Only your leave is shown.`}
        actions={<ApplyLeaveDialog />}
      />

      <LeaveQuotaPanel
        year={year}
        available={quota.available}
        used={quota.used}
        remaining={quota.remaining}
        pending={quota.pending}
        peopleLabel={`${ctx.fullName} · used ${quota.used} · ${quota.remaining} left`}
      />

      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="p-0">
          {history.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={CalendarDays} title="You have not taken leave this year" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((row) => {
                  const type = row.leaveTypeId ? typeById.get(row.leaveTypeId) : undefined;
                  const decided = type && !isUndecidedLeaveType(type.name);
                  return (
                  <TableRow key={row.key}>
                    <TableCell>
                      <LeaveReasonTip subject={row.subject} reason={row.reason}>
                        <span className="block max-w-xs">
                          <span className="block font-medium">{row.subject || "Leave"}</span>
                          {row.reason && row.reason !== row.subject ? (
                            <span className="line-clamp-2 text-xs text-muted-foreground">{row.reason}</span>
                          ) : null}
                        </span>
                      </LeaveReasonTip>
                    </TableCell>
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
                          {type.name ? ` · ${type.name}` : ""}
                        </Badge>
                      ) : row.requestId ? (
                        <Badge variant="outline" className="font-medium">
                          Pending
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Marked</span>
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
