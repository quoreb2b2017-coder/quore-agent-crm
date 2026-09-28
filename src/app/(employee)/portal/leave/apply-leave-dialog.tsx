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

export function ApplyLeaveDialog() {
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
      description="Add a subject and reason. Admin decides if the leave is paid or unpaid. Saturday and Sunday are week off and are not deducted."
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
        <Label htmlFor="subject">Subject</Label>
        <Input id="subject" name="subject" required maxLength={120} placeholder="Short title for this leave" />
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
        <Textarea id="reason" name="reason" rows={3} required placeholder="Why you need this leave" />
      </div>
    </FormSheet>
  );
}
