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
import { createCampaign } from "./actions";

export function CreateCampaignDialog() {
  const [open, setOpen] = useState(false);
  const { handleSubmit, isPending, error } = useActionForm(
    (formData) => createCampaign({}, formData),
    () => {
      toast.success("Campaign created");
      setOpen(false);
    }
  );

  return (
    <FormSheet
      open={open}
      onOpenChange={setOpen}
      title="Create campaign"
      description="Set the campaign name and date range."
      onSubmit={handleSubmit}
      submitLabel="Create"
      isPending={isPending}
      error={error}
      trigger={
        <Button size="sm">
          <Plus className="size-4" />
          New Campaign
        </Button>
      }
    >
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={3} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="startsOn">Starts</Label>
        <Input id="startsOn" name="startsOn" type="date" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="endsOn">Ends</Label>
        <Input id="endsOn" name="endsOn" type="date" />
      </div>
    </FormSheet>
  );
}
