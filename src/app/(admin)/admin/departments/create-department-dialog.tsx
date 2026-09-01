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
import { createDepartment } from "./actions";

export function CreateDepartmentDialog() {
  const [open, setOpen] = useState(false);
  const { handleSubmit, isPending, error } = useActionForm(
    (formData) => createDepartment({}, formData),
    () => {
      toast.success("Department created");
      setOpen(false);
    }
  );

  return (
    <FormSheet
      open={open}
      onOpenChange={setOpen}
      title="Add department"
      description="Name appears across employees and reports."
      onSubmit={handleSubmit}
      submitLabel="Create"
      isPending={isPending}
      error={error}
      trigger={
        <Button size="sm">
          <Plus className="size-4" />
          Add Department
        </Button>
      }
    >
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={3} />
      </div>
    </FormSheet>
  );
}
