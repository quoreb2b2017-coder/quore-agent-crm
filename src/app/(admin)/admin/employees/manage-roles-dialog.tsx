"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormSheet } from "@/components/ui/form-sheet";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import {
  DEPARTMENT_KIND_OPTIONS,
  type DepartmentKind,
} from "@/lib/departments";
import { createRole, deleteRole, updateRole } from "@/app/(admin)/admin/roles/actions";

export type ManagedRole = {
  id: string;
  roleKey: string;
  displayName: string;
  description: string | null;
  departmentKind: DepartmentKind | null;
  isSystem: boolean;
  members: number;
};

function departmentLabel(kind: DepartmentKind | null) {
  if (!kind) return "—";
  return DEPARTMENT_KIND_OPTIONS.find((item) => item.kind === kind)?.defaultName ?? kind;
}

export function ManageRolesDialog({ roles: initialRoles }: { roles: ManagedRole[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState(initialRoles);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newRoleKey, setNewRoleKey] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newDepartmentKind, setNewDepartmentKind] = useState<DepartmentKind>("SALES");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editRoleKey, setEditRoleKey] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDepartmentKind, setEditDepartmentKind] = useState<DepartmentKind | "">("");

  function sync(rows: ManagedRole[]) {
    setRoles(rows);
  }

  function startEdit(role: ManagedRole) {
    setAdding(false);
    setEditingId(role.id);
    setEditDisplayName(role.displayName);
    setEditRoleKey(role.roleKey);
    setEditDescription(role.description ?? "");
    setEditDepartmentKind(role.departmentKind ?? "");
    setError(null);
  }

  async function saveNew() {
    if (newDisplayName.trim().length < 1 || newRoleKey.trim().length < 2) {
      setError("Display name and role key are required");
      return;
    }
    setBusyId("new");
    setError(null);
    const formData = new FormData();
    formData.set("displayName", newDisplayName.trim());
    formData.set("roleKey", newRoleKey.trim().toUpperCase());
    formData.set("description", newDescription.trim());
    formData.set("departmentKind", newDepartmentKind);
    const result = await createRole({}, formData);
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast.success(
      `Created “${newDisplayName.trim()}” under ${departmentLabel(newDepartmentKind)}`
    );
    setAdding(false);
    setNewDisplayName("");
    setNewRoleKey("");
    setNewDescription("");
    setNewDepartmentKind("SALES");
    router.refresh();
  }

  async function saveEdit(role: ManagedRole) {
    if (editDisplayName.trim().length < 1) {
      setError("Display name is required");
      return;
    }
    if (!editDepartmentKind) {
      setError("Pick a department for this role");
      return;
    }
    setBusyId(role.id);
    setError(null);
    const formData = new FormData();
    formData.set("roleId", role.id);
    formData.set("displayName", editDisplayName.trim());
    formData.set("description", editDescription.trim());
    formData.set("departmentKind", editDepartmentKind);
    if (!role.isSystem) formData.set("roleKey", editRoleKey.trim().toUpperCase());
    const result = await updateRole({}, formData);
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    sync(
      roles.map((row) =>
        row.id === role.id
          ? {
              ...row,
              displayName: editDisplayName.trim(),
              description: editDescription.trim() || null,
              departmentKind: editDepartmentKind,
              roleKey: role.isSystem ? row.roleKey : editRoleKey.trim().toUpperCase(),
            }
          : row
      )
    );
    toast.success(`Updated “${editDisplayName.trim()}”`);
    setEditingId(null);
    router.refresh();
  }

  async function removeRole(role: ManagedRole) {
    if (role.isSystem) return;
    if (role.members > 0) {
      setError("Move everyone off this role before deleting it");
      return;
    }
    if (!window.confirm(`Delete role “${role.displayName}”?`)) return;
    setBusyId(`del-${role.id}`);
    setError(null);
    const formData = new FormData();
    formData.set("roleId", role.id);
    const result = await deleteRole({}, formData);
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    sync(roles.filter((row) => row.id !== role.id));
    toast.success(`Deleted “${role.displayName}”`);
    if (editingId === role.id) setEditingId(null);
    router.refresh();
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          sync(initialRoles);
          setError(null);
          setAdding(false);
          setEditingId(null);
        }
      }}
      title="Roles"
      description="Roles only. Pick which department type the role belongs to. Assign people from Departments."
      onSubmit={(event) => {
        event.preventDefault();
        setOpen(false);
      }}
      submitLabel="Done"
      isPending={Boolean(busyId)}
      error={error ?? undefined}
      trigger={
        <Button size="sm" variant="outline">
          <KeyRound className="size-3.5" />
          Manage roles
        </Button>
      }
    >
      <div className="sm:col-span-2">
        {!adding ? (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setAdding(true);
              setEditingId(null);
              setError(null);
            }}
          >
            <Plus className="size-3.5" />
            New role
          </Button>
        ) : (
          <div className="grid gap-3 rounded-lg border bg-muted/20 p-3">
            <p className="text-sm font-medium">Create role</p>
            <div className="grid gap-2">
              <Label htmlFor="manage-role-dept">Department</Label>
              <select
                id="manage-role-dept"
                value={newDepartmentKind}
                onChange={(event) =>
                  setNewDepartmentKind(event.target.value as DepartmentKind)
                }
                className={NATIVE_SELECT_CLASS}
              >
                {DEPARTMENT_KIND_OPTIONS.map((item) => (
                  <option key={item.kind} value={item.kind}>
                    {item.defaultName}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="manage-role-name">Display name</Label>
              <Input
                id="manage-role-name"
                value={newDisplayName}
                onChange={(event) => setNewDisplayName(event.target.value)}
                placeholder="Customer Support"
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="manage-role-key">Role key</Label>
              <Input
                id="manage-role-key"
                value={newRoleKey}
                onChange={(event) => setNewRoleKey(event.target.value.toUpperCase())}
                placeholder="CUSTOMER_SUPPORT"
                className="uppercase"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="manage-role-desc">Description</Label>
              <Textarea
                id="manage-role-desc"
                value={newDescription}
                onChange={(event) => setNewDescription(event.target.value)}
                rows={2}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busyId === "new"}
                onClick={() => void saveNew()}
              >
                {busyId === "new" ? "Creating…" : "Create role"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busyId === "new"}
                onClick={() => {
                  setAdding(false);
                  setNewDisplayName("");
                  setNewRoleKey("");
                  setNewDescription("");
                  setNewDepartmentKind("SALES");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:col-span-2">
        {roles.map((role) => {
          const editing = editingId === role.id;
          return (
            <div key={role.id} className="grid gap-2 rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{role.displayName}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {role.roleKey}
                    {role.isSystem ? " · system" : ""} · {role.members}{" "}
                    {role.members === 1 ? "person" : "people"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Department: {departmentLabel(role.departmentKind)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={Boolean(busyId)}
                    onClick={() => startEdit(role)}
                  >
                    Edit
                  </Button>
                  {!role.isSystem ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={Boolean(busyId)}
                      onClick={() => void removeRole(role)}
                    >
                      <Trash2 className="size-3.5" />
                      Delete
                    </Button>
                  ) : null}
                </div>
              </div>

              {editing ? (
                <div className="grid gap-2 rounded-md border border-dashed bg-background p-2">
                  <Label htmlFor={`edit-dept-${role.id}`}>Department</Label>
                  <select
                    id={`edit-dept-${role.id}`}
                    value={editDepartmentKind}
                    onChange={(event) =>
                      setEditDepartmentKind(event.target.value as DepartmentKind)
                    }
                    className={NATIVE_SELECT_CLASS}
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
                  <Label htmlFor={`edit-name-${role.id}`}>Display name</Label>
                  <Input
                    id={`edit-name-${role.id}`}
                    value={editDisplayName}
                    onChange={(event) => setEditDisplayName(event.target.value)}
                  />
                  <Label htmlFor={`edit-key-${role.id}`}>Role key</Label>
                  <Input
                    id={`edit-key-${role.id}`}
                    value={editRoleKey}
                    onChange={(event) => setEditRoleKey(event.target.value.toUpperCase())}
                    className="uppercase"
                    disabled={role.isSystem}
                  />
                  <Label htmlFor={`edit-desc-${role.id}`}>Description</Label>
                  <Textarea
                    id={`edit-desc-${role.id}`}
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                    rows={2}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={busyId === role.id}
                      onClick={() => void saveEdit(role)}
                    >
                      {busyId === role.id ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : role.description ? (
                <p className="text-xs text-muted-foreground">{role.description}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="sm:col-span-2 text-xs text-muted-foreground">
        After creating a role, open{" "}
        <Link href="/admin/roles" className="underline underline-offset-2">
          Roles &amp; permissions
        </Link>{" "}
        to grant access.
      </p>
    </FormSheet>
  );
}

