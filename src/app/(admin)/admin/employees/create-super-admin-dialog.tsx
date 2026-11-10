"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldPlus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { FormSheet } from "@/components/ui/form-sheet";
import { useActionForm } from "@/hooks/use-action-form";
import { createSuperAdmin } from "./actions";

/** Like Add employee, for a new Super Admin account. The page shows it to Super Admin only. */
export function CreateSuperAdminDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { handleSubmit, isPending, error } = useActionForm(
    (formData) => createSuperAdmin({}, formData),
    () => {
      toast.success("Super Admin added. They can sign in now.");
      setOpen(false);
      router.refresh();
    }
  );

  return (
    <FormSheet
      open={open}
      onOpenChange={setOpen}
      title="Add Super Admin"
      description="Creates a new account with full access. It is not part of any team, shift clock or payroll."
      onSubmit={handleSubmit}
      submitLabel="Create Super Admin"
      isPending={isPending}
      error={error}
      trigger={
        <Button size="sm" variant="outline">
          <ShieldPlus className="size-4" />
          Add Super Admin
        </Button>
      }
    >
      <div className="flex gap-2.5 rounded-sm border border-warning/30 bg-warning/10 p-3 text-[13px] leading-relaxed sm:col-span-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <p>
          A Super Admin can see and change everything: salaries, roles, every employee and the audit log. Add only
          someone you fully trust, such as an owner or director. Every Super Admin gets a security alert.
        </p>
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="sa-fullName">Full name</Label>
        <Input id="sa-fullName" name="fullName" required autoComplete="off" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="sa-email">Work email</Label>
        <Input id="sa-email" name="email" type="email" required autoComplete="off" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="sa-phone">Phone</Label>
        <Input id="sa-phone" name="phone" type="tel" required autoComplete="off" />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor="sa-password">Password</Label>
        <PasswordInput
          id="sa-password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          aria-describedby="sa-password-hint"
        />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor="sa-confirm">Confirm password</Label>
        <PasswordInput
          id="sa-confirm"
          name="confirmPassword"
          required
          minLength={8}
          autoComplete="new-password"
          aria-describedby="sa-password-hint"
        />
      </div>
      {/* Under both boxes, so the two columns stay the same height and line up. */}
      <p id="sa-password-hint" className="-mt-2 text-xs text-muted-foreground sm:col-span-2">
        At least 8 characters.
      </p>
    </FormSheet>
  );
}
