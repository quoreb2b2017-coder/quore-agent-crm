import { Coffee } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatDuration } from "@/lib/format";
import { BREAK_POLICY_LABEL, formatBreakType } from "@/lib/shift";
import type { BreakRow } from "@/lib/queries/employee-status";

export function BreaksPanel({
  rows,
  showEmployee,
  description,
  emptyDescription,
}: {
  rows: BreakRow[];
  showEmployee: boolean;
  description: string;
  emptyDescription?: string;
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b py-4">
        <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
          <span className="flex size-8 items-center justify-center rounded-xl bg-warning/15 text-warning-foreground">
            <Coffee className="size-4" />
          </span>
          Breaks
        </CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Coffee}
              title="No breaks yet"
              description={
                emptyDescription ?? `${BREAK_POLICY_LABEL} from the clock on this page.`
              }
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {showEmployee ? <TableHead>Employee</TableHead> : null}
                <TableHead>Type</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  {showEmployee ? <TableCell>{row.employeeName ?? "—"}</TableCell> : null}
                  <TableCell>{formatBreakType(row.breakType)}</TableCell>
                  <TableCell>{formatDateTime(row.startedAt)}</TableCell>
                  <TableCell>
                    {row.endedAt ? (
                      <Badge variant="outline">Ended</Badge>
                    ) : (
                      <Badge variant="outline" className="border-warning/20 bg-warning/10 text-warning">
                        In progress
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.durationSeconds != null ? formatDuration(row.durationSeconds) : "—"}
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
