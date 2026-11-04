"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormSheet } from "@/components/ui/form-sheet";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import {
  DEPARTMENT_KIND_OPTIONS,
  normalizeDepartmentKind,
  type DepartmentKind,
} from "@/lib/departments";
import { deleteRole, updateRole } from "./actions";

export type EditableRole = {
  id: string;
  role_key: string;
  display_name: string;
  description: string | null;
  department_kind: string | null;
  is_system: boolean;
  members: number;
};

function kindFromRole(departmentKind: string | null): DepartmentKind | "" {
  return normalizeDepartmentKind(departmentKind) ?? "";
}

export function EditRoleDialog({ role }: { role: EditableRole }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(role.display_name);
  const [roleKey, setRoleKey] = useState(role.role_key);
  const [description, setDescription] = useState(role.description ?? "");
  const [departmentKind, setDepartmentKind] = useState<DepartmentKind | "">(
    kindFromRole(role.department_kind)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetFromRole() {
    setDisplayName(role.display_name);
    setRoleKey(role.role_key);
    setDescription(role.description ?? "");
    setDepartmentKind(kindFromRole(role.department_kind));
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!departmentKind) {
      setError("Pick a department for this role");
      return;
    }
    setBusy(true);
    setError(null);
    const formData = new FormData();
    formData.set("roleId", role.id);
    formData.set("displayName", displayName);
    formData.set("description", description);
    formData.set("departmentKind", departmentKind);
    if (!role.is_system) formData.set("roleKey", roleKey);
    const result = await updateRole({}, formData);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast.success(`Updated “${displayName.trim()}”`);
    setOpen(false);
    router.refresh();
  }

  async function handleDelete() {
    if (role.is_system) return;
    if (role.members > 0) {
      setError("Move everyone off this role before deleting it");
      return;
    }
    if (!window.confirm(`Delete role “${role.display_name}”?`)) return;
    setBusy(true);
    setError(null);
    const formData = new FormData();
    formData.set("roleId", role.id);
    const result = await deleteRole({}, formData);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast.success(`Deleted “${role.display_name}”`);
    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) resetFromRole();
      }}
      title="Edit role"
      description={
        role.is_system
          ? "System roles keep a fixed key. You can still change the department and display name."
          : "Update the department this role belongs under, or remove a custom role nobody uses."
      }
      onSubmit={handleSubmit}
      submitLabel="Save role"
      isPending={busy}
      error={error ?? undefined}
      trigger={
        <Button type="button" size="sm" variant="outline">
          <Pencil className="size-3.5" />
          Edit
        </Button>
      }
    >
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor={`edit-role-dept-${role.id}`}>Department</Label>
        <select
          id={`edit-role-dept-${role.id}`}
          value={departmentKind}
          onChange={(event) => setDepartmentKind(event.target.value as DepartmentKind)}
          className={NATIVE_SELECT_CLASS}
          required
        >
          <option value="" disabled>
            Select department
          </option>
          {DEPARTMENT_KIND_OPTIONS.map((item) => (
            <option key={item.kind} value={item.kind}>
              {item.defaultName}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor={`edit-role-name-${role.id}`}>Display name</Label>
        <Input
          id={`edit-role-name-${role.id}`}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          required
        />
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor={`edit-role-key-${role.id}`}>Role key</Label>
        <Input
          id={`edit-role-key-${role.id}`}
          value={roleKey}
          onChange={(event) => setRoleKey(event.target.value.toUpperCase())}
          className="uppercase"
          disabled={role.is_system}
          required={!role.is_system}
        />
        {role.is_system ? (
          <p className="text-xs text-muted-foreground">System role key cannot change.</p>
        ) : null}
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor={`edit-role-desc-${role.id}`}>Description</Label>
        <Textarea
          id={`edit-role-desc-${role.id}`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
        />
      </div>
      {!role.is_system ? (
        <div className="sm:col-span-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={busy}
            onClick={() => void handleDelete()}
          >
            <Trash2 className="size-3.5" />
            Delete role
          </Button>
        </div>
      ) : null}
    </FormSheet>
  );
}
