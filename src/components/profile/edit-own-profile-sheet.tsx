"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSheet } from "@/components/ui/form-sheet";
import { useActionForm } from "@/hooks/use-action-form";
import { updateOwnProfile } from "@/lib/actions/profile";

/** Super Admin's own details. The sign-in email and password are changed elsewhere. */
export function EditOwnProfileSheet({
  fullName,
  phone,
  workLocation,
  email,
}: {
  fullName: string;
  phone: string;
  workLocation: string;
  email: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { handleSubmit, isPending, error } = useActionForm(
    (formData) => updateOwnProfile({}, formData),
    () => {
      toast.success("Profile updated");
      setOpen(false);
      router.refresh();
    }
  );

  return (
    <FormSheet
      open={open}
      onOpenChange={setOpen}
      title="Edit your profile"
      description="Your name, phone and work location. Changes are saved in the audit log."
      onSubmit={handleSubmit}
      submitLabel="Save profile"
      isPending={isPending}
      error={error}
      trigger={
        <Button size="sm" variant="outline">
          <Pencil className="size-4" />
          Edit profile
        </Button>
      }
    >
      <div className="grid content-start gap-2 sm:col-span-2">
        <Label htmlFor="own-name">Full name</Label>
        <Input id="own-name" name="fullName" defaultValue={fullName} required autoComplete="name" />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor="own-phone">Phone</Label>
        <Input id="own-phone" name="phone" type="tel" defaultValue={phone} required autoComplete="tel" />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor="own-location">Work location</Label>
        <Input id="own-location" name="workLocation" defaultValue={workLocation} autoComplete="off" />
      </div>
      <div className="grid content-start gap-2 sm:col-span-2">
        <Label htmlFor="own-email">Sign-in email</Label>
        <Input id="own-email" value={email} readOnly disabled aria-describedby="own-email-hint" />
        <p id="own-email-hint" className="text-xs text-muted-foreground">
          Not changed here, so a typo cannot lock you out. Change your password from the Password tab.
        </p>
      </div>
    </FormSheet>
  );
}
