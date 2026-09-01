"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormSheet } from "@/components/ui/form-sheet";
import { useActionForm } from "@/hooks/use-action-form";
import { applyForLeave } from "./actions";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";

export function ApplyLeaveDialog({
  leaveTypes,
}: {
  leaveTypes: { id: string; name: string; is_paid: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const { handleSubmit, isPending, error } = useActionForm(
    (formData) => applyForLeave({}, formData),
    () => {
      toast.success("Leave request submitted");
      setOpen(false);
    }
  );

  return (
    <FormSheet
      open={open}
      onOpenChange={setOpen}
      title="Apply for leave"
      description="18 paid days a year. Saturday and Sunday are week off and are not deducted from leave."
      onSubmit={handleSubmit}
      submitLabel="Submit request"
      isPending={isPending}
      error={error}
      trigger={
        <Button size="sm">
          <Plus className="size-4" />
          Apply for Leave
        </Button>
      }
    >
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="leaveTypeId">Leave type</Label>
        <select
          id="leaveTypeId"
          name="leaveTypeId"
          required
          defaultValue=""
          className={NATIVE_SELECT_CLASS}
        >
          <option value="" disabled>
            Select leave type
          </option>
          {leaveTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.is_paid ? "Paid" : "Unpaid"})
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="startDate">Start date</Label>
        <Input id="startDate" name="startDate" type="date" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="endDate">End date</Label>
        <Input id="endDate" name="endDate" type="date" required />
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="reason">Reason</Label>
        <Textarea id="reason" name="reason" rows={3} />
      </div>
    </FormSheet>
  );
}
