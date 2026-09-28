"use client";

import { useState, useTransition, type FormEvent } from "react";
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
  subject: string;
  reason: string;
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
  const [decideOpen, setDecideOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { handleSubmit, isPending: isSaving, error } = useActionForm(
    (formData) => updateLeaveRequest(formData),
    () => {
      toast.success("Leave request updated");
      setOpen(false);
    }
  );

  function reject() {
    startTransition(async () => {
      const res = await reviewLeaveRequest(request.id, "REJECTED");
      if (res.error) toast.error(res.error);
      else toast.success("Leave rejected");
    });
  }

  function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const leaveTypeId = String(new FormData(event.currentTarget).get("leaveTypeId") || "");
    startTransition(async () => {
      const res = await reviewLeaveRequest(request.id, "APPROVED", leaveTypeId);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Leave approved");
        setDecideOpen(false);
      }
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
          <FormSheet
            open={decideOpen}
            onOpenChange={setDecideOpen}
            title="Decide leave type"
            description="The employee sent a subject and reason. Choose paid or unpaid before approving."
            onSubmit={approve}
            submitLabel="Approve"
            isPending={isPending}
            trigger={
              <Button size="icon-sm" variant="outline" disabled={busy} aria-label="Approve and set leave type">
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5 text-success" />}
              </Button>
            }
          >
            <div className="grid gap-1 sm:col-span-2">
              <p className="text-sm font-medium">{request.subject || "No subject"}</p>
              <p className="text-sm text-muted-foreground">{request.reason || "No reason"}</p>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor={`decide-type-${request.id}`}>Leave type</Label>
              <select
                id={`decide-type-${request.id}`}
                name="leaveTypeId"
                required
                defaultValue={request.leaveTypeId}
                className={NATIVE_SELECT_CLASS}
              >
                <option value="" disabled>
                  Select paid or unpaid type
                </option>
                {leaveTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name} ({type.is_paid ? "Paid" : "Unpaid"})
                  </option>
                ))}
              </select>
            </div>
          </FormSheet>
          <Button size="icon-sm" variant="outline" disabled={busy} onClick={reject} aria-label="Reject leave">
            <X className="size-3.5 text-destructive" />
          </Button>
        </>
      ) : null}
      <FormSheet
        open={open}
        onOpenChange={setOpen}
        title="Edit leave"
        description="Set the leave type, dates, or reason. Approved leave is reapplied to attendance."
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
            <option value="" disabled>
              Select paid or unpaid type
            </option>
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
          <Label htmlFor={`subject-${request.id}`}>Subject</Label>
          <Input
            id={`subject-${request.id}`}
            name="subject"
            defaultValue={request.subject}
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor={`reason-${request.id}`}>Reason</Label>
          <Textarea
            id={`reason-${request.id}`}
            name="reason"
            rows={3}
            defaultValue={request.reason}
          />
        </div>
      </FormSheet>
      <Button size="icon-sm" variant="destructive" disabled={busy} onClick={remove}>
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
