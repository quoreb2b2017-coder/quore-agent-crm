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
import { createWorkPolicy } from "./actions";

export function CreatePolicyDialog() {
  const [open, setOpen] = useState(false);
  const { handleSubmit, isPending, error } = useActionForm(
    (formData) => createWorkPolicy({}, formData),
    () => {
      toast.success("Work policy created");
      setOpen(false);
    }
  );

  return (
    <FormSheet
      open={open}
      onOpenChange={setOpen}
      title="Create work policy"
      description="Idle limits and rules applied to tracked sessions."
      onSubmit={handleSubmit}
      submitLabel="Create"
      isPending={isPending}
      error={error}
      trigger={
        <Button size="sm">
          <Plus className="size-4" />
          New Policy
        </Button>
      }
    >
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" placeholder="Standard Working Hours" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="maxIdleMinutes">Max idle minutes</Label>
        <Input id="maxIdleMinutes" name="maxIdleMinutes" type="number" min="1" placeholder="15" />
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={3} />
      </div>
    </FormSheet>
  );
}
