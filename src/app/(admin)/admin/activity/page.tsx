import { Bath } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
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
import { formatDuration, formatTime, shiftWindowLabel, todayIso } from "@/lib/format";
import { requireViewer } from "@/lib/permissions/server";
import { getAdminWashroomActivity } from "@/lib/queries/washroom-activity";

export default async function AdminActivityPage() {
  const { seesAll } = await requireViewer();
  if (!seesAll) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Activity" description={shiftWindowLabel()} />
        <Card>
          <CardContent>
            <EmptyState
              icon={Bath}
              title="Admin only"
              description="Washroom visit counts are visible to Super Admin."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const rows = await getAdminWashroomActivity(todayIso());
  const totalVisits = rows.reduce((sum, row) => sum + row.visitCount, 0);
  const totalSeconds = rows.reduce((sum, row) => sum + row.totalSeconds, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Activity"
        description={`${shiftWindowLabel()} · washroom visits this shift`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Employees who went" value={rows.length} icon={Bath} tone="info" />
        <StatCard label="Total visits" value={totalVisits} icon={Bath} tone="warning" />
        <StatCard label="Total washroom time" value={formatDuration(totalSeconds)} icon={Bath} />
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Bath}
                title="No washroom visits yet"
                description="When an employee taps Washroom, the visit count and time appear here. This is not productive time."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Employee</TableHead>
                  <TableHead>Visits</TableHead>
                  <TableHead>Total time</TableHead>
                  <TableHead className="pr-5">This shift</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.employeeId} className="align-top hover:bg-muted/40">
                    <TableCell className="pl-5">
                      <div className="flex min-w-0 flex-col">
                        <span className="font-medium">{row.fullName}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{row.employeeCode}</span>
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums font-semibold">
                      {row.visitCount}
                      {row.open ? (
                        <Badge variant="outline" className="ml-2 border-info/25 bg-info/10 text-info">
                          In washroom
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDuration(row.totalSeconds)}</TableCell>
                    <TableCell className="pr-5">
                      <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                        {row.visits.map((visit) => (
                          <li key={visit.id} className="tabular-nums">
                            {formatTime(visit.startedAt)}
                            {visit.endedAt ? ` – ${formatTime(visit.endedAt)}` : " – now"}
                            {" · "}
                            {formatDuration(visit.durationSeconds)}
                          </li>
                        ))}
                      </ul>
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
