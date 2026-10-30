"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { FormSheet } from "@/components/ui/form-sheet";
import { useActionForm } from "@/hooks/use-action-form";
import { STAFF_DEPARTMENTS } from "@/lib/permissions/roles";
import { createEmployee } from "./actions";

export function CreateEmployeeDialog({
  trigger,
  redirectToOnboarding = false,
}: { trigger?: ReactNode; redirectToOnboarding?: boolean } = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { handleSubmit, isPending, error } = useActionForm(
    (formData) => createEmployee({}, formData),
    (result) => {
      toast.success("Employee created · onboarding started");
      setOpen(false);
      if (redirectToOnboarding && result.employeeId) {
        router.push(`/admin/onboarding/${result.employeeId}`);
      }
    }
  );

  return (
    <FormSheet
      open={open}
      onOpenChange={setOpen}
      title="Add employee"
      description="They can sign in with this email and password."
      onSubmit={handleSubmit}
      submitLabel="Create employee"
      isPending={isPending}
      error={error}
      trigger={
        trigger ?? (
          <Button size="sm">
            <Plus className="size-4" />
            Add Employee
          </Button>
        )
      }
    >
      <div className="grid gap-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" name="fullName" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="off" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="phone">Phone number</Label>
        <Input id="phone" name="phone" type="tel" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="employeeCode">Employee ID</Label>
        <Input id="employeeCode" name="employeeCode" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="joiningDate">Date of joining</Label>
        <Input
          id="joiningDate"
          name="joiningDate"
          type="date"
          defaultValue={new Date().toLocaleDateString("en-CA")}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="dateOfBirth">Date of birth</Label>
        <Input
          id="dateOfBirth"
          name="dateOfBirth"
          type="date"
          max={new Date().toLocaleDateString("en-CA")}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          name="password"
          minLength={4}
          autoComplete="new-password"
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          minLength={4}
          autoComplete="new-password"
          required
        />
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="department">Department</Label>
        <select
          id="department"
          name="department"
          required
          defaultValue=""
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="" disabled>
            Select department
          </option>
          {STAFF_DEPARTMENTS.map((item) => (
            <option key={item.roleKey} value={item.roleKey}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
    </FormSheet>
  );
}
