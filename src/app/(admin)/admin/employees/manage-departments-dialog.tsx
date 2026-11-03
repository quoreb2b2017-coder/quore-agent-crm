"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSheet } from "@/components/ui/form-sheet";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import {
  DEPARTMENT_KIND_OPTIONS,
  roleAllowedForKind,
  rolesForDepartmentKind,
  type AssignableRoleKey,
  type DepartmentKind,
} from "@/lib/departments";
import type { DepartmentOption } from "@/lib/queries/departments";
import type { EmployeeDirectoryOption } from "@/lib/queries/employee-directory";
import {
  assignEmployeeToDepartment,
  createDepartment,
  deleteDepartment,
  renameDepartment,
} from "./actions";

export function ManageDepartmentsDialog({
  departments: initialDepartments,
  employees: initialEmployees = [],
}: {
  departments: DepartmentOption[];
  employees?: EmployeeDirectoryOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [departments, setDepartments] = useState(initialDepartments);
  const [employees, setEmployees] = useState(initialEmployees);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialDepartments.map((row) => [row.id, row.name]))
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<DepartmentKind>("SALES");
  const [assignForId, setAssignForId] = useState<string | null>(null);
  const [assignEmployeeId, setAssignEmployeeId] = useState("");
  const [assignRoleKey, setAssignRoleKey] = useState<AssignableRoleKey | "">("");

  const membersByDepartment = new Map<string, EmployeeDirectoryOption[]>();
  for (const dept of departments) {
    membersByDepartment.set(
      dept.id,
      employees.filter(
        (row) =>
          row.departmentId === dept.id ||
          (row.departmentId == null && roleAllowedForKind(dept.kind, row.roleKey))
      )
    );
  }

  function syncFrom(rows: DepartmentOption[], people = employees) {
    setDepartments(rows);
    setDrafts(Object.fromEntries(rows.map((row) => [row.id, row.name])));
    setEmployees(people);
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
    setAssignForId(created.id);
    const roles = rolesForDepartmentKind(created.kind);
    setAssignRoleKey(roles.length === 1 ? roles[0].roleKey : "");
    setAssignEmployeeId("");
    toast.success(`Department “${created.name}” added — assign people below`);
    router.refresh();
  }

  async function removeDepartment(departmentId: string, name: string) {
    if (
      !window.confirm(
        `Delete department “${name}”? People stay in the system; only the department link is removed.`
      )
    ) {
      return;
    }
    setBusyId(departmentId);
    setError(null);
    const formData = new FormData();
    formData.set("departmentId", departmentId);
    const result = await deleteDepartment({}, formData);
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    syncFrom(departments.filter((row) => row.id !== departmentId));
    if (assignForId === departmentId) setAssignForId(null);
    toast.success(`Deleted “${name}”`);
    router.refresh();
  }

  async function assignMember(departmentId: string) {
    const dept = departments.find((row) => row.id === departmentId);
    if (!dept) return;
    if (!assignEmployeeId) {
      setError("Pick an employee to assign");
      return;
    }
    if (!assignRoleKey) {
      setError("Pick a role for this department");
      return;
    }
    setBusyId(`assign-${departmentId}`);
    setError(null);
    const formData = new FormData();
    formData.set("departmentId", departmentId);
    formData.set("employeeId", assignEmployeeId);
    formData.set("roleKey", assignRoleKey);
    const result = await assignEmployeeToDepartment({}, formData);
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    const person = employees.find((row) => row.id === assignEmployeeId);
    setEmployees((rows) =>
      rows.map((row) =>
        row.id === assignEmployeeId
          ? { ...row, departmentId, roleKey: assignRoleKey as AssignableRoleKey }
          : row
      )
    );
    toast.success(
      person
        ? `${person.fullName} assigned to ${dept.name}`
        : "Employee assigned to department"
    );
    setAssignEmployeeId("");
    router.refresh();
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          syncFrom(initialDepartments, initialEmployees);
          setError(null);
          setAdding(false);
          setAssignForId(null);
          setAssignEmployeeId("");
          setAssignRoleKey("");
        }
      }}
      title="Add department"
      description="Create a department, then assign employees and roles here. Add Employee only picks from these departments."
      onSubmit={(event) => {
        event.preventDefault();
        setOpen(false);
      }}
      submitLabel="Done"
      isPending={Boolean(busyId)}
      error={error ?? undefined}
      trigger={
        <Button size="sm" variant="outline">
          <Plus className="size-3.5" />
          Add department
        </Button>
      }
    >
      <div className="sm:col-span-2">
        {!adding ? (
          <Button type="button" size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" />
            New department
          </Button>
        ) : (
          <div className="grid gap-2 rounded-lg border bg-muted/20 p-3">
            <Label htmlFor="manage-dept-name">Department name</Label>
            <Input
              id="manage-dept-name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="e.g. Sales Operations North"
              autoFocus
            />
            <Label htmlFor="manage-dept-kind">Type (which roles belong here)</Label>
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
                {busyId === "new" ? "Adding…" : "Create department"}
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

      <div className="grid gap-3 sm:col-span-2">
        {departments.map((row) => {
          const roles = rolesForDepartmentKind(row.kind);
          const roleLabels = roles.map((role) => role.label).join(" · ");
          const members = membersByDepartment.get(row.id) ?? [];
          const assigning = assignForId === row.id;
          return (
            <div key={row.id} className="grid gap-2 rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {DEPARTMENT_KIND_OPTIONS.find((item) => item.kind === row.kind)?.defaultName ??
                    row.kind}
                </p>
                <p className="text-xs text-muted-foreground">{roleLabels}</p>
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
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={Boolean(busyId)}
                  onClick={() => void removeDepartment(row.id, row.name)}
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              </div>

              <div className="rounded-md border bg-muted/20 px-3 py-2">
                <p className="text-xs font-medium text-muted-foreground">
                  People ({members.length})
                </p>
                {members.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">No one assigned yet.</p>
                ) : (
                  <ul className="mt-1 space-y-0.5 text-sm">
                    {members.map((person) => (
                      <li key={person.id}>
                        {person.fullName}{" "}
                        <span className="font-mono text-xs text-muted-foreground">
                          ({person.employeeCode})
                        </span>{" "}
                        · {roles.find((role) => role.roleKey === person.roleKey)?.label ?? person.roleKey}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {!assigning ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAssignForId(row.id);
                    setAssignEmployeeId("");
                    setAssignRoleKey(roles.length === 1 ? roles[0].roleKey : "");
                    setError(null);
                  }}
                >
                  Assign employee
                </Button>
              ) : (
                <div className="grid gap-2 rounded-md border border-dashed p-3">
                  <Label htmlFor={`assign-emp-${row.id}`}>Employee</Label>
                  <select
                    id={`assign-emp-${row.id}`}
                    value={assignEmployeeId}
                    onChange={(event) => setAssignEmployeeId(event.target.value)}
                    className={NATIVE_SELECT_CLASS}
                  >
                    <option value="">Select employee</option>
                    {employees.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.fullName} ({person.employeeCode})
                        {person.departmentId === row.id ? " · already here" : ""}
                      </option>
                    ))}
                  </select>
                  <Label htmlFor={`assign-role-${row.id}`}>Role</Label>
                  <select
                    id={`assign-role-${row.id}`}
                    value={assignRoleKey}
                    onChange={(event) =>
                      setAssignRoleKey(event.target.value as AssignableRoleKey | "")
                    }
                    className={NATIVE_SELECT_CLASS}
                  >
                    <option value="" disabled>
                      Select role
                    </option>
                    {roles.map((role) => (
                      <option key={role.roleKey} value={role.roleKey}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={busyId === `assign-${row.id}`}
                      onClick={() => void assignMember(row.id)}
                    >
                      {busyId === `assign-${row.id}` ? "Assigning…" : "Save assignment"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyId === `assign-${row.id}`}
                      onClick={() => {
                        setAssignForId(null);
                        setAssignEmployeeId("");
                        setAssignRoleKey("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </FormSheet>
  );
}
