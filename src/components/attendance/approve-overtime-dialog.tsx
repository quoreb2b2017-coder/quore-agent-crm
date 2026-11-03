"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { approvePendingOvertime } from "@/lib/actions/attendance";
import { OT_WINDOW_MINUTES } from "@/lib/shift";

export function ApproveOvertimeDialog({
  employeeId,
  employeeName,
  attendanceDate,
  pendingMinutes,
}: {
  employeeId: string;
  employeeName: string;
  attendanceDate: string;
  pendingMinutes: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  if (pendingMinutes <= 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs">
          OT {pendingMinutes}m
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve overtime?</DialogTitle>
          <DialogDescription>
            {employeeName} worked {pendingMinutes} min past shift after filling the 7h 45m target.
            OT always needs your approval (even a full {OT_WINDOW_MINUTES} min) before it counts on the
            graph.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm tabular-nums">
          Date <span className="font-medium">{attendanceDate}</span> · pending{" "}
          <span className="font-medium">{pendingMinutes} min</span>
        </p>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const result = await approvePendingOvertime(employeeId, attendanceDate);
                if (result.error) {
                  toast.error(result.error);
                  return;
                }
                toast.success(`Approved ${pendingMinutes} min overtime`);
                setOpen(false);
                router.refresh();
              });
            }}
          >
            {pending ? "Approving…" : "Approve OT"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
