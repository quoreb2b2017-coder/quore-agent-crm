import type { ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { isUndecidedLeaveType } from "@/lib/leave";
import type { LeaveHistoryRow } from "@/lib/queries/leave";
import { sheetCellClassName, sheetHeadClassName, sheetRowClassName } from "@/lib/sheet-styles";
import { cn } from "@/lib/utils";

const statusTone: Record<string, string> = {
  PENDING: "bg-warning/10 text-warning border-warning/30",
  APPROVED: "bg-success/10 text-success border-success/30",
  REJECTED: "bg-destructive/10 text-destructive border-destructive/30",
  CANCELLED: "bg-muted text-muted-foreground border-border",
  ON_LEAVE: "bg-info/10 text-info border-info/30",
};

const frozenClassName = "sm:sticky sm:left-0";

type LeaveType = { id: string; name: string; is_paid: boolean };

/** One leave per row. Admin pages pass `employee` and `action`; an employee sees only their own. */
export function LeaveHistorySheet({
  rows,
  leaveTypes,
  emptyTitle,
  employee,
  action,
}: {
  rows: LeaveHistoryRow[];
  leaveTypes: LeaveType[];
  emptyTitle: string;
  employee?: (row: LeaveHistoryRow) => { name: ReactNode; code: string };
  action?: (row: LeaveHistoryRow, decidedTypeId: string) => ReactNode;
}) {
  const typeById = new Map(leaveTypes.map((type) => [type.id, type]));
  const pending = rows.filter((row) => row.status === "PENDING").length;

  return (
    <section className="border bg-card">
      <div className="border-b bg-muted px-3 py-2">
        <h2 className="text-sm font-semibold">Leave requests</h2>
        <p className="text-xs text-muted-foreground">
          {rows.length} this year{pending > 0 ? ` · ${pending} waiting for a decision` : ""}
        </p>
      </div>
      {rows.length === 0 ? (
        <div className="p-6">
          <EmptyState icon={CalendarDays} title={emptyTitle} />
        </div>
      ) : (
        <div className="[&>[data-slot=table-container]]:max-h-[70svh]">
          <Table className="border-separate border-spacing-0">
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="hover:bg-transparent">
                {employee ? (
                  <>
                    <TableHead className={cn(sheetHeadClassName, frozenClassName, "z-[2]")}>Name</TableHead>
                    <TableHead className={sheetHeadClassName}>Employee ID</TableHead>
                  </>
                ) : null}
                <TableHead className={sheetHeadClassName}>Subject</TableHead>
                <TableHead className={sheetHeadClassName}>Reason</TableHead>
                <TableHead className={sheetHeadClassName}>Type</TableHead>
                <TableHead className={sheetHeadClassName}>Pay</TableHead>
                <TableHead className={sheetHeadClassName}>From</TableHead>
                <TableHead className={sheetHeadClassName}>To</TableHead>
                <TableHead className={cn(sheetHeadClassName, "text-right")}>Days</TableHead>
                <TableHead className={cn(sheetHeadClassName, !action && "border-r-0")}>Status</TableHead>
                {action ? (
                  <TableHead className={cn(sheetHeadClassName, "border-r-0 text-right")}>Action</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const type = row.leaveTypeId ? typeById.get(row.leaveTypeId) : undefined;
                const decided = type && !isUndecidedLeaveType(type.name) ? type : undefined;
                const person = employee?.(row);
                return (
                  <TableRow key={row.key} className={sheetRowClassName}>
                    {person ? (
                      <>
                        <TableCell className={cn(sheetCellClassName, frozenClassName, "z-[1] bg-inherit")}>
                          {person.name}
                        </TableCell>
                        <TableCell className={cn(sheetCellClassName, "font-mono text-xs font-semibold")}>
                          {person.code}
                        </TableCell>
                      </>
                    ) : null}
                    <TableCell className={cn(sheetCellClassName, "min-w-40 font-medium whitespace-normal")}>
                      {row.subject || "Leave"}
                    </TableCell>
                    <TableCell className={cn(sheetCellClassName, "min-w-52 whitespace-normal text-muted-foreground")}>
                      {row.reason && row.reason !== row.subject ? row.reason : "—"}
                    </TableCell>
                    <TableCell className={sheetCellClassName}>
                      {decided ? decided.name : row.requestId ? "Not decided" : "Marked"}
                    </TableCell>
                    <TableCell className={sheetCellClassName}>
                      {decided ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-sm font-semibold",
                            decided.is_paid
                              ? "border-success/30 bg-success/10 text-success"
                              : "border-warning/30 bg-warning/10 text-warning"
                          )}
                        >
                          {decided.is_paid ? "Paid" : "Unpaid"}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className={sheetCellClassName}>{formatDate(row.startDate)}</TableCell>
                    <TableCell className={sheetCellClassName}>{formatDate(row.endDate)}</TableCell>
                    <TableCell className={cn(sheetCellClassName, "text-right font-semibold")}>{row.days}</TableCell>
                    <TableCell className={cn(sheetCellClassName, !action && "border-r-0")}>
                      <Badge
                        variant="outline"
                        className={cn("rounded-sm font-semibold capitalize", statusTone[row.status])}
                      >
                        {row.status === "ON_LEAVE" ? "Taken" : row.status.toLowerCase()}
                      </Badge>
                    </TableCell>
                    {action ? (
                      <TableCell className={cn(sheetCellClassName, "border-r-0 px-1.5 text-right")}>
                        {action(row, decided?.id ?? "")}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
