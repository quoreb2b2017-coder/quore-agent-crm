"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormSheet } from "@/components/ui/form-sheet";
import { useActionForm } from "@/hooks/use-action-form";
import { createLead } from "./actions";

export function CreateLeadDialog({
  campaigns,
}: {
  campaigns: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const { handleSubmit, isPending, error } = useActionForm(
    (formData) => createLead({}, formData),
    () => {
      toast.success("Lead added");
      setOpen(false);
    }
  );

  return (
    <FormSheet
      open={open}
      onOpenChange={setOpen}
      title="Add lead"
      description="Capture contact details and optional campaign source."
      onSubmit={handleSubmit}
      submitLabel="Add lead"
      isPending={isPending}
      error={error}
      trigger={
        <Button size="sm">
          <Plus className="size-4" />
          New Lead
        </Button>
      }
    >
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" name="fullName" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" />
      </div>
      {campaigns.length > 0 ? (
        <div className="grid gap-2">
          <Label>Campaign</Label>
          <Select name="campaignId">
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select campaign" />
            </SelectTrigger>
            <SelectContent>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="source">Source</Label>
        <Input id="source" name="source" placeholder="Website, referral, event..." />
      </div>
    </FormSheet>
  );
}
