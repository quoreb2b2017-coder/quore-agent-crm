"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSheet } from "@/components/ui/form-sheet";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import {
  DEPARTMENT_KIND_OPTIONS,
  type AssignableRoleKey,
  type DepartmentKind,
} from "@/lib/departments";
import type { DepartmentOption } from "@/lib/queries/departments";
import type { AssignableDepartmentRole } from "@/lib/queries/assignable-roles";
import type { EmployeeDirectoryOption } from "@/lib/queries/employee-directory";
import {
  assignEmployeeToDepartment,
  createDepartment,
  deleteDepartment,
  renameDepartment,
} from "./actions";

function rolesForKind(roles: AssignableDepartmentRole[], kind: DepartmentKind | null | undefined) {
  if (!kind) return [];
  return roles.filter((role) => role.kind === kind);
}

function defaultRoleKey(roles: AssignableDepartmentRole[]) {
  return roles[0]?.roleKey ?? "";
}

function peopleInDepartment(
  departmentId: string,
  kind: DepartmentKind,
  employees: EmployeeDirectoryOption[],
  roles: AssignableDepartmentRole[]
) {
  const allowed = new Set(rolesForKind(roles, kind).map((r) => r.roleKey));
  return employees.filter(
    (row) =>
      row.departmentId === departmentId ||
      (row.departmentId == null && allowed.has(row.roleKey))
  );
}

/**
 * Departments only: create a department, see who is in it, add/move people.
 * Roles are managed separately (Manage roles). Role is auto-picked when assigning.
 */
export function ManageDepartmentsDialog({
  departments: initialDepartments,
  employees: initialEmployees = [],
  assignableRoles: initialAssignableRoles = [],
}: {
  departments: DepartmentOption[];
  employees?: EmployeeDirectoryOption[];
  assignableRoles?: AssignableDepartmentRole[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [departments, setDepartments] = useState(initialDepartments);
  const [employees, setEmployees] = useState(initialEmployees);
  const [roles, setRoles] = useState(initialAssignableRoles);
  const [selectedId, setSelectedId] = useState(initialDepartments[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create department
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<DepartmentKind>("SALES");

  // Rename
  const [nameDraft, setNameDraft] = useState(initialDepartments[0]?.name ?? "");

  // Add / move person
  const [personId, setPersonId] = useState("");
  const [targetDeptId, setTargetDeptId] = useState("");

  const selected = departments.find((d) => d.id === selectedId) ?? null;
  const people = selected
    ? peopleInDepartment(selected.id, selected.kind, employees, roles)
    : [];

  function boot() {
    setDepartments(initialDepartments);
    setEmployees(initialEmployees);
    setRoles(initialAssignableRoles);
    const first = initialDepartments[0];
    setSelectedId(first?.id ?? "");
    setNameDraft(first?.name ?? "");
    setShowCreate(false);
    setNewName("");
    setNewKind("SALES");
    setPersonId("");
    setTargetDeptId("");
    setError(null);
  }

  function pickDepartment(id: string) {
    setSelectedId(id);
    setNameDraft(departments.find((d) => d.id === id)?.name ?? "");
    setPersonId("");
    setTargetDeptId("");
    setError(null);
  }

  async function createDepartmentOnly() {
    const name = newName.trim();
    if (name.length < 2) {
      setError("Enter a department name");
      return;
    }
    setBusy(true);
    setError(null);
    const formData = new FormData();
    formData.set("name", name);
    formData.set("kind", newKind);
    const result = await createDepartment({}, formData);
    setBusy(false);
    if (result.error || !result.departmentId || !result.name || !result.kind) {
      setError(result.error ?? "Could not create department");
      return;
    }
    const created: DepartmentOption = {
      id: result.departmentId,
      name: result.name,
      kind: result.kind,
    };
    const next = [...departments, created].sort((a, b) => a.name.localeCompare(b.name));
    setDepartments(next);
    setShowCreate(false);
    setNewName("");
    pickDepartment(created.id);
    setNameDraft(created.name);
    toast.success(`Department “${created.name}” created`);
    router.refresh();
  }

  async function saveDepartmentName() {
    if (!selected) return;
    const name = nameDraft.trim();
    if (name.length < 2) {
      setError("Name is too short");
      return;
    }
    setBusy(true);
    setError(null);
    const formData = new FormData();
    formData.set("departmentId", selected.id);
    formData.set("name", name);
    formData.set("kind", selected.kind);
    const result = await renameDepartment({}, formData);
    setBusy(false);
    if (result.error || !result.name) {
      setError(result.error ?? "Could not save");
      return;
    }
    setDepartments((rows) =>
      rows.map((row) => (row.id === selected.id ? { ...row, name: result.name! } : row))
    );
    toast.success("Name saved");
    router.refresh();
  }

  async function deleteSelected() {
    if (!selected) return;
    if (!window.confirm(`Delete department “${selected.name}”? Employees stay in the system.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    const formData = new FormData();
    formData.set("departmentId", selected.id);
    const result = await deleteDepartment({}, formData);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    const nextDepts = departments.filter((d) => d.id !== selected.id);
    setDepartments(nextDepts);
    setEmployees((rows) =>
      rows.map((row) =>
        row.departmentId === selected.id ? { ...row, departmentId: null } : row
      )
    );
    const first = nextDepts[0];
    setSelectedId(first?.id ?? "");
    setNameDraft(first?.name ?? "");
    toast.success("Department deleted");
    router.refresh();
  }

  /** Put (or move) a person into a department. Role is chosen automatically. */
  async function putEmployeeInDepartment(employeeId: string, departmentId: string) {
    const dept = departments.find((d) => d.id === departmentId);
    if (!dept) {
      setError("Pick a department");
      return;
    }
    const roleKey = defaultRoleKey(rolesForKind(roles, dept.kind));
    if (!roleKey) {
      setError("No role for this department. Create a role under Manage roles first.");
      return;
    }
    setBusy(true);
    setError(null);
    const formData = new FormData();
    formData.set("departmentId", departmentId);
    formData.set("employeeId", employeeId);
    formData.set("roleKey", roleKey);
    const result = await assignEmployeeToDepartment({}, formData);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEmployees((rows) =>
      rows.map((row) =>
        row.id === employeeId
          ? { ...row, departmentId, roleKey: roleKey as AssignableRoleKey }
          : row
      )
    );
    toast.success(`Assigned to ${dept.name}`);
    setPersonId("");
    setTargetDeptId("");
    router.refresh();
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) boot();
      }}
      title="Departments"
      description="1) Create a department. 2) Put employees in it. Roles are managed separately."
      onSubmit={(event) => {
        event.preventDefault();
        setOpen(false);
      }}
      submitLabel="Done"
      isPending={busy}
      error={error ?? undefined}
      trigger={
        <Button size="sm" variant="outline">
          <Building2 className="size-3.5" />
          Departments
        </Button>
      }
    >
      <div className="grid gap-5 sm:col-span-2">
        {/* —— Create department —— */}
        <section className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">1. Departments</h3>
            {!showCreate ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setShowCreate(true);
                  setError(null);
                }}
              >
                <Plus className="size-3.5" />
                New department
              </Button>
            ) : null}
          </div>

          {showCreate ? (
            <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
              <Label htmlFor="dept-new-name">Department name</Label>
              <Input
                id="dept-new-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Sales"
                autoFocus
              />
              <Label htmlFor="dept-new-kind">Department type</Label>
              <select
                id="dept-new-kind"
                value={newKind}
                onChange={(e) => setNewKind(e.target.value as DepartmentKind)}
                className={NATIVE_SELECT_CLASS}
              >
                {DEPARTMENT_KIND_OPTIONS.map((item) => (
                  <option key={item.kind} value={item.kind}>
                    {item.defaultName}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || newName.trim().length < 2}
                  onClick={() => void createDepartmentOnly()}
                >
                  {busy ? "Creating…" : "Create"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setShowCreate(false);
                    setNewName("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          <Label htmlFor="dept-pick">Open department</Label>
          <select
            id="dept-pick"
            value={selectedId}
            onChange={(e) => pickDepartment(e.target.value)}
            className={NATIVE_SELECT_CLASS}
            disabled={departments.length === 0}
          >
            {departments.length === 0 ? (
              <option value="">Create a department first</option>
            ) : (
              departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({peopleInDepartment(d.id, d.kind, employees, roles).length} people)
                </option>
              ))
            )}
          </select>

          {selected ? (
            <div className="flex flex-wrap gap-2">
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                className="min-w-[10rem] flex-1"
                aria-label="Rename department"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || nameDraft.trim() === selected.name}
                onClick={() => void saveDepartmentName()}
              >
                Rename
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={busy}
                onClick={() => void deleteSelected()}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ) : null}
        </section>

        {/* —— People in this department —— */}
        {selected ? (
          <section className="grid gap-2">
            <h3 className="text-sm font-semibold">2. People in {selected.name}</h3>
            <div className="rounded-lg border bg-card p-3">
              {people.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nobody here yet.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {people.map((person) => (
                    <li
                      key={person.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                    >
                      <span>
                        {person.fullName}{" "}
                        <span className="text-muted-foreground">({person.employeeCode})</span>
                      </span>
                      {departments.length > 1 ? (
                        <select
                          aria-label={`Move ${person.fullName}`}
                          className={`${NATIVE_SELECT_CLASS} w-auto max-w-[11rem]`}
                          defaultValue=""
                          disabled={busy}
                          onChange={(e) => {
                            const next = e.target.value;
                            e.target.value = "";
                            if (next) void putEmployeeInDepartment(person.id, next);
                          }}
                        >
                          <option value="" disabled>
                            Move to…
                          </option>
                          {departments
                            .filter((d) => d.id !== selected.id)
                            .map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                        </select>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ) : null}

        {/* —— Assign existing employee —— */}
        {selected ? (
          <section className="grid gap-2">
            <h3 className="text-sm font-semibold">3. Put an employee here</h3>
            <div className="flex flex-wrap gap-2">
              <select
                value={personId}
                onChange={(e) => setPersonId(e.target.value)}
                className={`${NATIVE_SELECT_CLASS} min-w-[10rem] flex-1`}
              >
                <option value="">Choose employee</option>
                {employees
                  .filter((p) => p.departmentId !== selected.id)
                  .map((p) => {
                    const current = departments.find((d) => d.id === p.departmentId);
                    return (
                      <option key={p.id} value={p.id}>
                        {p.fullName}
                        {current ? ` (now: ${current.name})` : " (no department)"}
                      </option>
                    );
                  })}
              </select>
              <Button
                type="button"
                size="sm"
                disabled={busy || !personId}
                onClick={() => void putEmployeeInDepartment(personId, selected.id)}
              >
                <UserPlus className="size-3.5" />
                Add here
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Their role is set automatically for this department. To change roles, use Manage
              roles.
            </p>
          </section>
        ) : null}

        {/* Optional: assign any employee to any department from one place */}
        {departments.length > 0 ? (
          <section className="grid gap-2 border-t pt-4">
            <h3 className="text-sm font-semibold">Or assign department to anyone</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                value={personId}
                onChange={(e) => setPersonId(e.target.value)}
                className={NATIVE_SELECT_CLASS}
              >
                <option value="">Employee</option>
                {employees.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </select>
              <select
                value={targetDeptId}
                onChange={(e) => setTargetDeptId(e.target.value)}
                className={NATIVE_SELECT_CLASS}
              >
                <option value="">Department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              size="sm"
              className="w-fit"
              disabled={busy || !personId || !targetDeptId}
              onClick={() => void putEmployeeInDepartment(personId, targetDeptId)}
            >
              Assign department
            </Button>
          </section>
        ) : null}
      </div>
    </FormSheet>
  );
}
