"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "@/app/(admin)/admin/employees/actions";

function rolesForKind(roles: AssignableDepartmentRole[], kind: DepartmentKind) {
  const matched = roles.filter((r) => r.kind === kind);
  if (matched.length > 0) return matched;
  // Built-in fallback so Admin Control always shows HR even if roles.department_kind is stale.
  const builtIn = DEPARTMENT_KIND_OPTIONS.find((o) => o.kind === kind)?.roles ?? [];
  return builtIn.map((role) => ({
    roleKey: role.roleKey,
    label: role.label,
    kind,
    description: null,
  }));
}

function defaultRole(roles: AssignableDepartmentRole[]) {
  return roles[0]?.roleKey ?? "";
}

function peopleIn(
  dept: DepartmentOption,
  employees: EmployeeDirectoryOption[],
  roles: AssignableDepartmentRole[]
) {
  const allowed = new Set(rolesForKind(roles, dept.kind).map((r) => r.roleKey));
  return employees.filter(
    (row) =>
      row.departmentId === dept.id ||
      (row.departmentId == null && allowed.has(row.roleKey))
  );
}

export function TeamsBoard({
  departments: initialDepartments,
  employees: initialEmployees,
  assignableRoles,
  canManageRoles,
}: {
  departments: DepartmentOption[];
  employees: EmployeeDirectoryOption[];
  assignableRoles: AssignableDepartmentRole[];
  canManageRoles: boolean;
}) {
  const router = useRouter();
  const [departments, setDepartments] = useState(initialDepartments);
  const [employees, setEmployees] = useState(initialEmployees);
  const [selectedId, setSelectedId] = useState(initialDepartments[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  /** Existing role key, or "__other__" to create a new role. */
  const [newRolePick, setNewRolePick] = useState("");
  const [newKind, setNewKind] = useState<DepartmentKind | "">("");
  const [newRoleName, setNewRoleName] = useState("");
  const [nameDraft, setNameDraft] = useState(initialDepartments[0]?.name ?? "");
  const [addPersonId, setAddPersonId] = useState("");

  const isOtherRole = newRolePick === "__other__";
  const newRoleKey = newRoleName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  // Keep sidebar in sync when server re-fetches Admin Control / HR after ensure.
  useEffect(() => {
    setDepartments(initialDepartments);
    setEmployees(initialEmployees);
    setSelectedId((current) => {
      if (initialDepartments.some((d) => d.id === current)) return current;
      return initialDepartments[0]?.id ?? "";
    });
  }, [initialDepartments, initialEmployees]);

  useEffect(() => {
    const next = departments.find((d) => d.id === selectedId);
    if (next) setNameDraft(next.name);
  }, [departments, selectedId]);

  const selected = departments.find((d) => d.id === selectedId) ?? null;
  const deptRoles = selected ? rolesForKind(assignableRoles, selected.kind) : [];
  const people = selected ? peopleIn(selected, employees, assignableRoles) : [];

  function selectDept(id: string) {
    setSelectedId(id);
    setNameDraft(departments.find((d) => d.id === id)?.name ?? "");
    setAddPersonId("");
    setError(null);
  }

  function resetCreateForm() {
    setNewName("");
    setNewRolePick("");
    setNewKind("");
    setNewRoleName("");
  }

  function openCreate() {
    setCreating(true);
    resetCreateForm();
    setError(null);
  }

  function pickRole(value: string) {
    setNewRolePick(value);
    setNewRoleName("");
    if (value === "__other__") {
      setNewKind("");
      return;
    }
    const role = assignableRoles.find((r) => r.roleKey === value);
    setNewKind(role?.kind ?? "");
  }

  async function createDept() {
    if (newName.trim().length < 2) {
      setError("Enter a department name");
      return;
    }
    if (!newRolePick) {
      setError("Pick a role type");
      return;
    }
    if (isOtherRole) {
      if (newRoleName.trim().length < 2) {
        setError("Enter a new role name");
        return;
      }
      if (!newKind) {
        setError("Pick which team family this role belongs under");
        return;
      }
      if (newRoleKey.length < 2) {
        setError("Role name needs letters so we can build a role key");
        return;
      }
    } else if (!newKind) {
      setError("Pick a role type");
      return;
    }
    setBusy(true);
    setError(null);
    const formData = new FormData();
    formData.set("name", newName.trim());
    formData.set("kind", newKind);
    if (isOtherRole) {
      formData.set("newRoleName", newRoleName.trim());
      formData.set("newRoleKey", newRoleKey);
    }
    const result = await createDepartment({}, formData);
    setBusy(false);
    if (result.error || !result.departmentId || !result.name || !result.kind) {
      setError(result.error ?? "Could not create");
      return;
    }
    const created: DepartmentOption = {
      id: result.departmentId,
      name: result.name,
      kind: result.kind,
    };
    const next = [...departments, created].sort((a, b) => a.name.localeCompare(b.name));
    setDepartments(next);
    setCreating(false);
    resetCreateForm();
    selectDept(created.id);
    setNameDraft(created.name);
    toast.success(
      isOtherRole
        ? `Created ${created.name} with role ${newRoleName.trim()}`
        : `Created ${created.name}`
    );
    router.refresh();
  }

  async function renameDept() {
    if (!selected) return;
    const name = nameDraft.trim();
    if (name.length < 2) {
      setError("Name too short");
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
      rows.map((r) => (r.id === selected.id ? { ...r, name: result.name! } : r))
    );
    toast.success("Saved");
    router.refresh();
  }

  async function removeDept() {
    if (!selected) return;
    if (!window.confirm(`Delete “${selected.name}”? People stay in the system.`)) return;
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
    const next = departments.filter((d) => d.id !== selected.id);
    setDepartments(next);
    setEmployees((rows) =>
      rows.map((r) =>
        r.departmentId === selected.id ? { ...r, departmentId: null } : r
      )
    );
    const first = next[0];
    setSelectedId(first?.id ?? "");
    setNameDraft(first?.name ?? "");
    toast.success("Deleted");
    router.refresh();
  }

  async function putInDepartment(employeeId: string, departmentId: string) {
    const dept = departments.find((d) => d.id === departmentId);
    if (!dept) return;
    const roleKey = defaultRole(rolesForKind(assignableRoles, dept.kind));
    if (!roleKey) {
      setError("No role for this department. Ask Super Admin to create one under Roles.");
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
      rows.map((r) =>
        r.id === employeeId
          ? { ...r, departmentId, roleKey: roleKey as AssignableRoleKey }
          : r
      )
    );
    toast.success(`Moved to ${dept.name}`);
    setAddPersonId("");
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      {/* Left: department list */}
      <aside className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Teams
          </h2>
          <Button type="button" size="sm" variant="outline" onClick={openCreate}>
            <Plus className="size-3.5" />
            New department
          </Button>
        </div>

        {creating ? (
          <div className="grid gap-2 rounded-xl border bg-card p-3">
            <div className="grid gap-1">
              <Label htmlFor="new-dept-name" className="text-xs">
                Department name
              </Label>
              <Input
                id="new-dept-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Customer Support"
                autoFocus
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-dept-role" className="text-xs">
                Type (role)
              </Label>
              <select
                id="new-dept-role"
                value={newRolePick}
                onChange={(e) => pickRole(e.target.value)}
                className={NATIVE_SELECT_CLASS}
              >
                <option value="" disabled>
                  Select role…
                </option>
                {assignableRoles.map((role) => (
                  <option key={role.roleKey} value={role.roleKey}>
                    {role.label}
                  </option>
                ))}
                <option value="__other__">Other… (new role)</option>
              </select>
            </div>
            {isOtherRole ? (
              <>
                <div className="grid gap-1">
                  <Label htmlFor="new-role-name" className="text-xs">
                    New role name
                  </Label>
                  <Input
                    id="new-role-name"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="e.g. Support Agent"
                  />
                  {newRoleKey ? (
                    <p className="text-[11px] text-muted-foreground">Key: {newRoleKey}</p>
                  ) : null}
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="new-role-family" className="text-xs">
                    Belongs under
                  </Label>
                  <select
                    id="new-role-family"
                    value={newKind}
                    onChange={(e) => setNewKind(e.target.value as DepartmentKind | "")}
                    className={NATIVE_SELECT_CLASS}
                  >
                    <option value="" disabled>
                      Select…
                    </option>
                    {DEPARTMENT_KIND_OPTIONS.map((item) => (
                      <option key={item.kind} value={item.kind}>
                        {item.defaultName}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={
                  busy ||
                  newName.trim().length < 2 ||
                  !newRolePick ||
                  (isOtherRole
                    ? newRoleName.trim().length < 2 || !newKind || newRoleKey.length < 2
                    : !newKind)
                }
                onClick={() => void createDept()}
              >
                Create
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setCreating(false);
                  resetCreateForm();
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        <nav className="flex flex-col gap-1">
          {departments.map((dept) => {
            const count = peopleIn(dept, employees, assignableRoles).length;
            const active = dept.id === selectedId;
            const roleNames = rolesForKind(assignableRoles, dept.kind)
              .map((r) => r.label)
              .join(", ");
            return (
              <button
                key={dept.id}
                type="button"
                onClick={() => selectDept(dept.id)}
                className={`rounded-lg px-3 py-2.5 text-left transition ${
                  active
                    ? "bg-ink text-white"
                    : "bg-card hover:bg-muted/60 ring-1 ring-border"
                }`}
              >
                <span className="block text-sm font-semibold">{dept.name}</span>
                <span
                  className={`block text-xs ${active ? "text-white/70" : "text-muted-foreground"}`}
                >
                  {count} people
                  {roleNames ? ` · ${roleNames}` : ""}
                </span>
              </button>
            );
          })}
        </nav>

        {canManageRoles ? (
          <p className="mt-auto pt-4 text-xs text-muted-foreground">
            Role permissions:{" "}
            <Link href="/admin/roles" className="underline underline-offset-2">
              Roles page
            </Link>
          </p>
        ) : null}
      </aside>

      {/* Right: selected department detail */}
      <section className="flex min-h-[28rem] flex-col gap-4 rounded-xl border bg-card p-5">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {!selected ? (
          <p className="text-sm text-muted-foreground">Select a department on the left.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-2 border-b pb-4">
              <div className="grid min-w-[12rem] flex-1 gap-1">
                <Label htmlFor="team-name">Department name</Label>
                <Input
                  id="team-name"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || nameDraft.trim() === selected.name}
                onClick={() => void renameDept()}
              >
                Save name
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={busy}
                onClick={() => void removeDept()}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              People here get role:{" "}
              <span className="font-medium text-foreground">
                {deptRoles.map((r) => r.label).join(", ") || "—"}
              </span>
            </p>

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Employees ({people.length})</h3>
              {people.length === 0 ? (
                <p className="text-sm text-muted-foreground">No one in this department yet.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {people.map((person) => (
                    <li
                      key={person.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                    >
                      <span>
                        {person.fullName}{" "}
                        <span className="text-muted-foreground">({person.employeeCode})</span>
                      </span>
                      {departments.length > 1 ? (
                        <select
                          className={`${NATIVE_SELECT_CLASS} w-auto max-w-[10rem]`}
                          defaultValue=""
                          disabled={busy}
                          aria-label={`Move ${person.fullName}`}
                          onChange={(e) => {
                            const next = e.target.value;
                            e.target.value = "";
                            if (next) void putInDepartment(person.id, next);
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

            <div className="mt-auto grid gap-2 border-t pt-4">
              <Label htmlFor="add-person">Add employee to {selected.name}</Label>
              <div className="flex flex-wrap gap-2">
                <select
                  id="add-person"
                  value={addPersonId}
                  onChange={(e) => setAddPersonId(e.target.value)}
                  className={`${NATIVE_SELECT_CLASS} min-w-[12rem] flex-1`}
                >
                  <option value="">Choose employee…</option>
                  {employees
                    .filter((p) => p.departmentId !== selected.id)
                    .map((p) => {
                      const current = departments.find((d) => d.id === p.departmentId);
                      return (
                        <option key={p.id} value={p.id}>
                          {p.fullName}
                          {current ? ` · ${current.name}` : ""}
                        </option>
                      );
                    })}
                </select>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || !addPersonId}
                  onClick={() => void putInDepartment(addPersonId, selected.id)}
                >
                  <UserPlus className="size-3.5" />
                  Add
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
