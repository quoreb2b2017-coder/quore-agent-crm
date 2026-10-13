"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setLeaveRemaining, setLeaveRemainingForAll } from "@/lib/actions/leave";
import type { LeaveBalanceRow } from "@/lib/queries/leave";

export function LeaveBalances({ year, rows }: { year: number; rows: LeaveBalanceRow[] }) {
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
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-[15px] font-semibold">Leave left · {year}</h3>
          <p className="text-sm text-muted-foreground">
            Approved days stay used. Set how many paid days each person still has.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={366}
            step="0.5"
            value={allValue}
            onChange={(event) => setAllValue(event.target.value)}
            placeholder="Days left"
            className="w-28"
            aria-label="Remaining days for everyone"
          />
          <Button type="button" variant="outline" disabled={isPending || rows.length === 0} onClick={saveAll}>
            {pendingId === "all" ? <Loader2 className="size-4 animate-spin" /> : null}
            Set everyone
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-5 py-2 font-medium">Employee</th>
              <th className="px-3 py-2 font-medium">Used</th>
              <th className="px-3 py-2 font-medium">Left</th>
              <th className="px-5 py-2 text-right font-medium">Update left</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <BalanceRow
                key={`${row.employeeId}-${row.remaining}`}
                row={row}
                disabled={isPending}
                pending={pendingId === row.employeeId}
                onSave={saveOne}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
    <tr className="border-t">
      <td className="px-5 py-2.5">
        <div className="flex flex-col">
          <span className="font-medium">{row.fullName}</span>
          <span className="font-mono text-[11px] text-muted-foreground">{row.employeeCode}</span>
        </div>
      </td>
      <td className="px-3 py-2.5 tabular-nums">{row.used}</td>
      <td className="px-3 py-2.5 font-semibold tabular-nums">{row.remaining}</td>
      <td className="px-5 py-2.5">
        <div className="flex justify-end gap-2">
          <Input
            type="number"
            min={0}
            max={366}
            step="0.5"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="w-24"
            aria-label={`Remaining days for ${row.fullName}`}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onSave(row.employeeId, value)}
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </td>
    </tr>
  );
}
