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
import { calendarDateIsoIst, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getPaidLeaveQuota } from "@/lib/queries/leave";
import { LeaveQuotaPanel } from "@/components/leave/leave-quota-panel";
import { ApplyLeaveDialog } from "./apply-leave-dialog";

const statusTone: Record<string, string> = {
  PENDING: "bg-warning/10 text-warning border-warning/20",
  APPROVED: "bg-success/10 text-success border-success/20",
  REJECTED: "bg-destructive/10 text-destructive border-destructive/20",
  CANCELLED: "bg-muted text-muted-foreground border-transparent",
};

export default async function MyLeavePage() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return null;

  const supabase = await createClient();
  const year = Number(calendarDateIsoIst().slice(0, 4));

  const [{ data: leaveTypes }, { data: requests }, quota] = await Promise.all([
    supabase.from("leave_types").select("id, name, is_paid").order("name"),
    supabase
      .from("leave_requests")
      .select("id, leave_type_id, start_date, end_date, days_count, status")
      .eq("employee_id", ctx.employeeId)
      .order("created_at", { ascending: false }),
    getPaidLeaveQuota({ employeeIds: [ctx.employeeId], year, people: 1 }),
  ]);

  const typeById = new Map((leaveTypes ?? []).map((t) => [t.id, t]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Leave"
        description="18 paid days each year. Saturday and Sunday are week off and are not deducted."
        actions={<ApplyLeaveDialog leaveTypes={leaveTypes ?? []} />}
      />

      <LeaveQuotaPanel
        year={year}
        available={quota.available}
        used={quota.used}
        remaining={quota.remaining}
        pending={quota.pending}
        peopleLabel={`${ctx.fullName} · personal quota`}
      />

      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="p-0">
          {!requests || requests.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={CalendarDays} title="No leave requests yet" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Pay</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{typeById.get(r.leave_type_id)?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-medium",
                          typeById.get(r.leave_type_id)?.is_paid
                            ? "border-success/20 bg-success/10 text-success"
                            : "border-warning/20 bg-warning/10 text-warning"
                        )}
                      >
                        {typeById.get(r.leave_type_id)?.is_paid ? "Paid" : "Unpaid"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {formatDate(r.start_date)} – {formatDate(r.end_date)}
                    </TableCell>
                    <TableCell>{r.days_count}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("font-medium", statusTone[r.status])}>
                        {r.status}
                      </Badge>
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
