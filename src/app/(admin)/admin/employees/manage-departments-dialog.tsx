"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSheet } from "@/components/ui/form-sheet";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import {
  DEPARTMENT_KIND_OPTIONS,
  rolesForDepartmentKind,
  type DepartmentKind,
} from "@/lib/departments";
import type { DepartmentOption } from "@/lib/queries/departments";
import { createDepartment, renameDepartment } from "./actions";

export function ManageDepartmentsDialog({
  departments: initialDepartments,
}: {
  departments: DepartmentOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [departments, setDepartments] = useState(initialDepartments);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialDepartments.map((row) => [row.id, row.name]))
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<DepartmentKind>("SALES");

  function syncFrom(rows: DepartmentOption[]) {
    setDepartments(rows);
    setDrafts(Object.fromEntries(rows.map((row) => [row.id, row.name])));
  }

  async function saveRename(departmentId: string) {
    const name = (drafts[departmentId] ?? "").trim();
    if (name.length < 2) {
      setError("Department name is too short");
      return;
    }
    setBusyId(departmentId);
    setError(null);
    const formData = new FormData();
    formData.set("departmentId", departmentId);
    formData.set("name", name);
    const result = await renameDepartment({}, formData);
    setBusyId(null);
    if (result.error || !result.name) {
      setError(result.error ?? "Could not rename department");
      return;
    }
    syncFrom(
      departments.map((row) =>
        row.id === departmentId ? { ...row, name: result.name! } : row
      )
    );
    toast.success(`Renamed to “${result.name}”`);
    router.refresh();
  }

  async function saveNew() {
    setBusyId("new");
    setError(null);
    const formData = new FormData();
    formData.set("name", newName);
    formData.set("kind", newKind);
    const result = await createDepartment({}, formData);
    setBusyId(null);
    if (result.error || !result.departmentId || !result.name || !result.kind) {
      setError(result.error ?? "Could not add department");
      return;
    }
    const created: DepartmentOption = {
      id: result.departmentId,
      name: result.name,
      kind: result.kind,
    };
    syncFrom([...departments, created].sort((a, b) => a.name.localeCompare(b.name)));
    setAdding(false);
    setNewName("");
    toast.success(`Department “${created.name}” added`);
    router.refresh();
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          syncFrom(initialDepartments);
          setError(null);
          setAdding(false);
        }
      }}
      title="Departments"
      description="Rename departments anytime. Roles under each kind stay the same."
      onSubmit={(event) => {
        event.preventDefault();
        setOpen(false);
      }}
      submitLabel="Done"
      isPending={Boolean(busyId)}
      error={error ?? undefined}
      trigger={
        <Button size="sm" variant="outline">
          <Pencil className="size-3.5" />
          Departments
        </Button>
      }
    >
      <div className="grid gap-3 sm:col-span-2">
        {departments.map((row) => {
          const roles = rolesForDepartmentKind(row.kind)
            .map((role) => role.label)
            .join(" · ");
          return (
            <div key={row.id} className="grid gap-2 rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {DEPARTMENT_KIND_OPTIONS.find((item) => item.kind === row.kind)?.defaultName ??
                    row.kind}
                </p>
                <p className="text-xs text-muted-foreground">{roles}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Input
                  value={drafts[row.id] ?? row.name}
                  onChange={(event) =>
                    setDrafts((prev) => ({ ...prev, [row.id]: event.target.value }))
                  }
                  className="min-w-[12rem] flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyId === row.id || (drafts[row.id] ?? "").trim() === row.name}
                  onClick={() => void saveRename(row.id)}
                >
                  {busyId === row.id ? "Saving…" : "Save name"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sm:col-span-2">
        {!adding ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" />
            Add department
          </Button>
        ) : (
          <div className="grid gap-2 rounded-lg border bg-muted/20 p-3">
            <Label htmlFor="manage-dept-name">Name</Label>
            <Input
              id="manage-dept-name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Department name"
            />
            <Label htmlFor="manage-dept-kind">Type (roles)</Label>
            <select
              id="manage-dept-kind"
              value={newKind}
              onChange={(event) => setNewKind(event.target.value as DepartmentKind)}
              className={NATIVE_SELECT_CLASS}
            >
              {DEPARTMENT_KIND_OPTIONS.map((item) => (
                <option key={item.kind} value={item.kind}>
                  {item.defaultName} — {item.roles.map((role) => role.label).join(", ")}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busyId === "new" || newName.trim().length < 2}
                onClick={() => void saveNew()}
              >
                {busyId === "new" ? "Adding…" : "Add"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busyId === "new"}
                onClick={() => {
                  setAdding(false);
                  setNewName("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </FormSheet>
  );
}
