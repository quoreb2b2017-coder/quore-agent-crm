"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormSheet } from "@/components/ui/form-sheet";
import { useActionForm } from "@/hooks/use-action-form";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import { DEPARTMENT_KIND_OPTIONS } from "@/lib/departments";
import { createRole } from "./actions";

export function CreateRoleDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { handleSubmit, isPending, error } = useActionForm(
    (formData) => createRole({}, formData),
    () => {
      toast.success("Role created. It now shows under that department’s role dropdown.");
      setOpen(false);
      router.refresh();
    }
  );

  return (
    <FormSheet
      open={open}
      onOpenChange={setOpen}
      title="Create role"
      description="Pick the department this role belongs under. Then grant permissions on this page."
      onSubmit={handleSubmit}
      submitLabel="Create role"
      isPending={isPending}
      error={error}
      trigger={
        <Button size="sm">
          <Plus className="size-4" />
          New Role
        </Button>
      }
    >
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="departmentKind">Department</Label>
        <select
          id="departmentKind"
          name="departmentKind"
          required
          defaultValue="SALES"
          // Options: Admin Control, Sales, Marketing, Database, IT Field
          className={NATIVE_SELECT_CLASS}
        >
          {DEPARTMENT_KIND_OPTIONS.map((item) => (
            <option key={item.kind} value={item.kind}>
              {item.defaultName}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Hierarchy: Department → Role. This role will appear in that department’s role list.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="displayName">Display name</Label>
        <Input id="displayName" name="displayName" placeholder="Customer Support" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="roleKey">Role key</Label>
        <Input
          id="roleKey"
          name="roleKey"
          placeholder="CUSTOMER_SUPPORT"
          className="uppercase"
          required
        />
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={2} />
        <p className="text-xs text-muted-foreground">Role key is UPPER_SNAKE_CASE, used internally.</p>
      </div>
    </FormSheet>
  );
}
