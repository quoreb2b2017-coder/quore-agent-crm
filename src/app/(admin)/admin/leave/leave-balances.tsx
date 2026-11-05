"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { setLeaveRemaining, setLeaveRemainingForAll } from "@/lib/actions/leave";
import type { LeaveBalanceRow } from "@/lib/queries/leave";
import { sheetCellClassName, sheetHeadClassName, sheetRowClassName } from "@/lib/sheet-styles";
import { cn } from "@/lib/utils";

export function LeaveBalances({
  year,
  rows,
  single = false,
}: {
  year: number;
  rows: LeaveBalanceRow[];
  single?: boolean;
}) {
  const router = useRouter();
  const [allValue, setAllValue] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function saveOne(employeeId: string, raw: string) {
    const remaining = Number(raw);
    if (!Number.isFinite(remaining)) {
      toast.error("Enter how many days are left.");
      return;
    }
    setPendingId(employeeId);
    startTransition(async () => {
      const res = await setLeaveRemaining(employeeId, year, remaining);
      setPendingId(null);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Leave balance updated");
      router.refresh();
    });
  }

  function saveAll() {
    const remaining = Number(allValue);
    if (!Number.isFinite(remaining)) {
      toast.error("Enter how many days are left for everyone.");
      return;
    }
    if (!window.confirm(`Set ${remaining} paid days remaining for every employee in ${year}?`)) return;
    setPendingId("all");
    startTransition(async () => {
      const res = await setLeaveRemainingForAll(year, remaining);
      setPendingId(null);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Leave balances updated");
      router.refresh();
    });
  }

  return (
    <section className="border bg-card">
      <div className="flex flex-col gap-3 border-b bg-muted px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Leave left · {year}</h2>
          <p className="text-xs text-muted-foreground">
            Click a name for every leave they took. Used counts approved leave and days marked on leave.
          </p>
        </div>
        {single ? null : (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={366}
            step="0.5"
            value={allValue}
            onChange={(event) => setAllValue(event.target.value)}
            placeholder="Days left"
            className="w-28 rounded-sm bg-card"
            aria-label="Remaining days for everyone"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-sm bg-card"
            disabled={isPending || rows.length === 0}
            onClick={saveAll}
          >
            {pendingId === "all" ? <Loader2 className="size-4 animate-spin" /> : null}
            Set everyone
          </Button>
        </div>
        )}
      </div>
      <div className="[&>[data-slot=table-container]]:max-h-[70svh]">
        <Table className="border-separate border-spacing-0">
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(sheetHeadClassName, "z-[2] sm:sticky sm:left-0")}>Name</TableHead>
              <TableHead className={sheetHeadClassName}>Employee ID</TableHead>
              <TableHead className={cn(sheetHeadClassName, "text-right")}>Used</TableHead>
              <TableHead className={cn(sheetHeadClassName, "text-right")}>Left</TableHead>
              <TableHead className={cn(sheetHeadClassName, "border-r-0 text-right")}>Update left</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <BalanceRow
                key={`${row.employeeId}-${row.remaining}`}
                row={row}
                disabled={isPending}
                pending={pendingId === row.employeeId}
                onSave={saveOne}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function BalanceRow({
  row,
  disabled,
  pending,
  onSave,
}: {
  row: LeaveBalanceRow;
  disabled: boolean;
  pending: boolean;
  onSave: (employeeId: string, raw: string) => void;
}) {
  const [value, setValue] = useState(String(row.remaining));
  return (
    <TableRow className={sheetRowClassName}>
      <TableCell className={cn(sheetCellClassName, "z-[1] bg-inherit sm:sticky sm:left-0")}>
        <Link
          href={`/admin/leave?employee=${row.employeeId}`}
          className="font-semibold text-primary underline-offset-2 hover:underline"
        >
          {row.fullName}
        </Link>
      </TableCell>
      <TableCell className={cn(sheetCellClassName, "font-mono text-xs font-semibold")}>{row.employeeCode}</TableCell>
      <TableCell className={cn(sheetCellClassName, "text-right")}>{row.used}</TableCell>
      <TableCell
        className={cn(
          sheetCellClassName,
          "text-right font-bold",
          row.remaining > 0 ? "text-success" : "bg-destructive/10 text-destructive"
        )}
      >
        {row.remaining}
      </TableCell>
      <TableCell className={cn(sheetCellClassName, "border-r-0 px-1.5")}>
        <div className="flex justify-end gap-1.5">
          <Input
            type="number"
            min={0}
            max={366}
            step="0.5"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="w-20 rounded-sm bg-card"
            aria-label={`Remaining days for ${row.fullName}`}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-sm"
            disabled={disabled}
            onClick={() => onSave(row.employeeId, value)}
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
