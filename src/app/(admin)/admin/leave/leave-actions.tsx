"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, X, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormSheet } from "@/components/ui/form-sheet";
import { useActionForm } from "@/hooks/use-action-form";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import {
  deleteLeaveRequest,
  reviewLeaveRequest,
  updateLeaveRequest,
} from "@/lib/actions/leave";

type LeaveTypeOption = { id: string; name: string; is_paid: boolean };

type LeaveRow = {
  id: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: string;
};

export function LeaveAdminActions({
  request,
  leaveTypes,
}: {
  request: LeaveRow;
  leaveTypes: LeaveTypeOption[];
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { handleSubmit, isPending: isSaving, error } = useActionForm(
    (formData) => updateLeaveRequest(formData),
    () => {
      toast.success("Leave request updated");
      setOpen(false);
    }
  );

  function review(decision: "APPROVED" | "REJECTED") {
    startTransition(async () => {
      const res = await reviewLeaveRequest(request.id, decision);
      if (res.error) toast.error(res.error);
      else toast.success(decision === "APPROVED" ? "Leave approved" : "Leave rejected");
    });
  }

  function remove() {
    if (!window.confirm("Delete this leave request? Approved leave will be removed from attendance.")) {
      return;
    }
    startTransition(async () => {
      const res = await deleteLeaveRequest(request.id);
      if (res.error) toast.error(res.error);
      else toast.success("Leave request deleted");
    });
  }

  const busy = isPending || isSaving;

  return (
    <div className="flex items-center justify-end gap-1">
      {request.status === "PENDING" ? (
        <>
          <Button size="icon-sm" variant="outline" disabled={busy} onClick={() => review("APPROVED")}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5 text-success" />}
          </Button>
          <Button size="icon-sm" variant="outline" disabled={busy} onClick={() => review("REJECTED")}>
            <X className="size-3.5 text-destructive" />
          </Button>
        </>
      ) : null}
      <FormSheet
        open={open}
        onOpenChange={setOpen}
        title="Edit leave"
        description="Update the type, dates, or reason. Approved leave is reapplied to attendance."
        onSubmit={handleSubmit}
        submitLabel="Save"
        isPending={isSaving}
        error={error}
        trigger={
          <Button size="icon-sm" variant="outline" disabled={busy}>
            <Pencil className="size-3.5" />
          </Button>
        }
      >
        <input type="hidden" name="requestId" value={request.id} />
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor={`leaveType-${request.id}`}>Leave type</Label>
          <select
            id={`leaveType-${request.id}`}
            name="leaveTypeId"
            required
            defaultValue={request.leaveTypeId}
            className={NATIVE_SELECT_CLASS}
          >
            {leaveTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name} ({type.is_paid ? "Paid" : "Unpaid"})
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`start-${request.id}`}>Start date</Label>
          <Input
            id={`start-${request.id}`}
            name="startDate"
            type="date"
            required
            defaultValue={request.startDate}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`end-${request.id}`}>End date</Label>
          <Input
            id={`end-${request.id}`}
            name="endDate"
            type="date"
            required
            defaultValue={request.endDate}
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor={`reason-${request.id}`}>Reason</Label>
          <Textarea
            id={`reason-${request.id}`}
            name="reason"
            rows={3}
            defaultValue={request.reason ?? ""}
          />
        </div>
      </FormSheet>
      <Button size="icon-sm" variant="destructive" disabled={busy} onClick={remove}>
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
