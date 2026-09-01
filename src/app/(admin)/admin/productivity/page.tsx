import { TrendingUp } from "lucide-react";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDuration, shiftWindowLabel, todayIso } from "@/lib/format";
import { requireViewer } from "@/lib/permissions/server";
import { PRODUCTIVE_HOURS_LABEL, productivityPercent } from "@/lib/shift";
import { isUuid } from "@/lib/attendance-period";
import { listWatchableEmployees } from "@/lib/queries/admin-dashboard";
import { ProductivityFilters } from "./productivity-filters";

export default async function ProductivityPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { ctx, seesAll } = await requireViewer();
  const params = await searchParams;
  const requested = Array.isArray(params.employee) ? params.employee[0] : params.employee;
  const requestedId = requested && isUuid(requested) ? requested : null;
  const supabase = await createClient();
  const today = todayIso();

  const watchable = seesAll ? await listWatchableEmployees() : [];
  const employeeId =
    requestedId && watchable.some((employee) => employee.id === requestedId) ? requestedId : null;

  let employeesQuery = supabase
    .from("employees")
    .select("id, full_name, employee_code")
    .eq("employment_status", "ACTIVE");
  if (!seesAll) employeesQuery = employeesQuery.eq("id", ctx.employeeId);
  else if (employeeId) employeesQuery = employeesQuery.eq("id", employeeId);
  else if (watchable.length > 0) {
    employeesQuery = employeesQuery.in(
      "id",
      watchable.map((employee) => employee.id)
    );
  }

  let attendanceQuery = supabase
    .from("attendance")
    .select("employee_id, total_active_seconds, total_break_seconds, total_idle_seconds")
    .eq("attendance_date", today);
  if (!seesAll) attendanceQuery = attendanceQuery.eq("employee_id", ctx.employeeId);
  else if (employeeId) attendanceQuery = attendanceQuery.eq("employee_id", employeeId);

  const [{ data: attendance }, { data: employees }] = await Promise.all([
    attendanceQuery,
    employeesQuery,
  ]);

  const attendanceByEmployee = new Map((attendance ?? []).map((row) => [row.employee_id, row]));

  const rows = (employees ?? [])
    .map((employee) => {
      const record = attendanceByEmployee.get(employee.id);
      const active = record?.total_active_seconds ?? 0;
      return {
        employee,
        active,
        break: record?.total_break_seconds ?? 0,
        idle: record?.total_idle_seconds ?? 0,
        productivityPct: productivityPercent(active),
      };
    })
    .sort((a, b) => b.active - a.active);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Productivity"
        description={
          seesAll
            ? `Shift ${today} · ${shiftWindowLabel()} · % vs ${PRODUCTIVE_HOURS_LABEL} target`
            : `Your productivity · % vs ${PRODUCTIVE_HOURS_LABEL}`
        }
      />
      {seesAll ? <ProductivityFilters employees={watchable} employeeId={employeeId} /> : null}
      <Card>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="No productivity data yet"
              description="Productivity is computed from attendance once employees start clocking in."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Break</TableHead>
                  <TableHead>Idle</TableHead>
                  <TableHead>Productivity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.employee.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{row.employee.full_name}</span>
                        <span className="text-xs text-muted-foreground">{row.employee.employee_code}</span>
                      </div>
                    </TableCell>
                    <TableCell>{formatDuration(row.active)}</TableCell>
                    <TableCell>{formatDuration(row.break)}</TableCell>
                    <TableCell>{formatDuration(row.idle)}</TableCell>
                    <TableCell className="font-medium">{row.productivityPct}%</TableCell>
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
