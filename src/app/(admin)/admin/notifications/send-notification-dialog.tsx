"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormSheet } from "@/components/ui/form-sheet";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import { useActionForm } from "@/hooks/use-action-form";
import { sendNotification } from "./actions";
import { listNotificationRecipients } from "@/lib/actions/notifications";

export function SendNotificationDialog() {
  const [open, setOpen] = useState(false);
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([]);
  const { handleSubmit, isPending, error } = useActionForm(
    (formData) => sendNotification({}, formData),
    () => {
      toast.success("Notification sent");
      setOpen(false);
    }
  );

  useEffect(() => {
    if (!open || employees.length > 0) return;
    void listNotificationRecipients().then(setEmployees);
  }, [open, employees.length]);

  return (
    <FormSheet
      open={open}
      onOpenChange={setOpen}
      title="Send notification"
      description="Reach everyone or a single employee."
      onSubmit={handleSubmit}
      submitLabel="Send"
      isPending={isPending}
      error={error}
      trigger={
        <Button size="sm">
          <Plus className="size-4" />
          Send
        </Button>
      }
    >
      <div className="grid gap-2">
        <Label htmlFor="recipient">Recipient</Label>
        <select id="recipient" name="recipient" defaultValue="ALL" required className={NATIVE_SELECT_CLASS}>
          <option value="ALL">All employees</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.full_name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="body">Message</Label>
        <Textarea id="body" name="body" rows={4} />
      </div>
    </FormSheet>
  );
}
