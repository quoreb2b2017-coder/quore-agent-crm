"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HR_ROLE } from "@/lib/permissions/roles";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import { sheetCellClassName, sheetHeadClassName, sheetRowClassName } from "@/lib/sheet-styles";
import { cn } from "@/lib/utils";
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
  return employees.filter((row) =>
    // Super Admin has no department row and always belongs with Admin Control.
    row.isSuperAdmin
      ? dept.kind === "ADMIN_CONTROL"
      : row.departmentId === dept.id || (row.departmentId == null && allowed.has(row.roleKey))
  );
}

function peopleLabel(count: number) {
  return `${count} ${count === 1 ? "person" : "people"}`;
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
  // Both blocks use React's "adjust state while rendering" instead of an effect.
  const [seenProps, setSeenProps] = useState({ initialDepartments, initialEmployees });
  if (seenProps.initialDepartments !== initialDepartments || seenProps.initialEmployees !== initialEmployees) {
    setSeenProps({ initialDepartments, initialEmployees });
    setDepartments(initialDepartments);
    setEmployees(initialEmployees);
    setSelectedId((current) => {
      if (initialDepartments.some((d) => d.id === current)) return current;
      return initialDepartments[0]?.id ?? "";
    });
  }

  // A different team, or the same team renamed, resets the name box.
  const selectedName = departments.find((d) => d.id === selectedId)?.name;
  const draftSource = `${selectedId}|${selectedName ?? ""}`;
  const [seenDraftSource, setSeenDraftSource] = useState(draftSource);
  if (seenDraftSource !== draftSource) {
    setSeenDraftSource(draftSource);
    if (selectedName !== undefined) setNameDraft(selectedName);
  }

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

  function roleLabel(person: EmployeeDirectoryOption) {
    if (person.isSuperAdmin) return "Super Admin";
    return assignableRoles.find((role) => role.roleKey === person.roleKey)?.label ?? person.roleKey;
  }

  async function putInDepartment(employeeId: string, departmentId: string) {
    const dept = departments.find((d) => d.id === departmentId);
    if (!dept) return;
    const roleKey = defaultRole(rolesForKind(assignableRoles, dept.kind));
    if (!roleKey) {
      setError("No role for this department. Ask Super Admin to create one under Roles.");
      return;
    }
    const person = employees.find((row) => row.id === employeeId);
    if (
      person?.roleKey === HR_ROLE &&
      roleKey !== HR_ROLE &&
      !window.confirm(`Move ${person.fullName} to ${dept.name}? They will lose HR access.`)
    ) {
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
    <div className="grid items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      {/* Left: department list */}
      <aside className="border bg-card">
        <div className="flex items-center justify-between gap-2 border-b bg-muted px-3 py-2">
          <h2 className="text-sm font-semibold">
            Teams <span className="font-normal text-muted-foreground">· {departments.length}</span>
          </h2>
          <Button type="button" size="sm" variant="outline" className="rounded-sm bg-card" onClick={openCreate}>
            <Plus className="size-3.5" />
            New department
          </Button>
        </div>

        {creating ? (
          <div className="grid gap-2 border-b bg-muted/40 p-3">
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

        <nav className="flex flex-col">
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
                aria-current={active ? "true" : undefined}
                onClick={() => selectDept(dept.id)}
                className={cn(
                  "flex items-center justify-between gap-3 border-b px-3 py-2 text-left transition-colors last:border-b-0",
                  active ? "bg-ink text-white" : "hover:bg-accent"
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold">{dept.name}</span>
                  <span
                    className={cn("block truncate text-xs", active ? "text-white/70" : "text-muted-foreground")}
                  >
                    {roleNames || "No role"}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-sm px-1.5 py-0.5 text-xs font-bold tabular-nums",
                    active ? "bg-white/15 text-white" : count > 0 ? "bg-accent text-primary" : "bg-muted text-muted-foreground"
                  )}
                  title={peopleLabel(count)}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </nav>

        {canManageRoles ? (
          <p className="border-t bg-muted px-3 py-1.5 text-xs text-muted-foreground">
            Role permissions:{" "}
            <Link href="/admin/roles" className="font-medium text-primary underline-offset-2 hover:underline">
              Roles page
            </Link>
          </p>
        ) : null}
      </aside>

      {/* Right: selected department detail */}
      <section className="min-w-0 border bg-card">
        {error ? (
          <p className="border-b bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">{error}</p>
        ) : null}

        {!selected ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">Select a department on the left.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted px-3 py-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">
                  {selected.name} <span className="font-normal text-muted-foreground">· {peopleLabel(people.length)}</span>
                </h2>
                <p className="text-xs text-muted-foreground">
                  New people here get role: {deptRoles.map((r) => r.label).join(", ") || "—"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="team-name"
                  aria-label="Department name"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  className="w-48 rounded-sm bg-card"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-sm bg-card"
                  disabled={busy || nameDraft.trim() === selected.name}
                  onClick={() => void renameDept()}
                >
                  Save name
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  aria-label={`Delete ${selected.name}`}
                  title={`Delete ${selected.name}`}
                  className="rounded-sm bg-card text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={busy}
                  onClick={() => void removeDept()}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
              <select
                id="add-person"
                aria-label={`Add employee to ${selected.name}`}
                value={addPersonId}
                onChange={(e) => setAddPersonId(e.target.value)}
                className={cn(NATIVE_SELECT_CLASS, "w-full rounded-sm bg-card sm:w-80")}
              >
                <option value="">Add employee to {selected.name}…</option>
                {employees
                  .filter((p) => p.departmentId !== selected.id && !p.isSuperAdmin)
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
                className="rounded-sm"
                disabled={busy || !addPersonId}
                onClick={() => void putInDepartment(addPersonId, selected.id)}
              >
                <UserPlus className="size-3.5" />
                Add
              </Button>
            </div>

            {people.length === 0 ? (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">No one in this team yet.</p>
            ) : (
              <div className="[&>[data-slot=table-container]]:max-h-[calc(100svh-19rem)]">
                <Table className="border-separate border-spacing-0">
                  <TableHeader className="sticky top-0 z-10">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={cn(sheetHeadClassName, "w-11 px-1 text-center")}>#</TableHead>
                      <TableHead className={sheetHeadClassName}>Name</TableHead>
                      <TableHead className={sheetHeadClassName}>Employee ID</TableHead>
                      <TableHead className={sheetHeadClassName}>Role</TableHead>
                      <TableHead className={sheetHeadClassName}>Email</TableHead>
                      <TableHead className={sheetHeadClassName}>Phone</TableHead>
                      <TableHead className={cn(sheetHeadClassName, "w-44 border-r-0")}>Move to</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {people.map((person, index) => (
                      <TableRow key={person.id} className={sheetRowClassName}>
                        <TableCell
                          className={cn(sheetCellClassName, "bg-muted px-1 text-center font-mono text-xs text-muted-foreground")}
                        >
                          {index + 1}
                        </TableCell>
                        <TableCell className={sheetCellClassName}>
                          <Link
                            href={`/admin/employees/${person.id}`}
                            className="font-semibold text-primary underline-offset-2 hover:underline"
                          >
                            {person.fullName}
                          </Link>
                        </TableCell>
                        <TableCell className={cn(sheetCellClassName, "font-mono text-xs font-semibold")}>
                          {person.employeeCode}
                        </TableCell>
                        <TableCell className={sheetCellClassName}>
                          <span className="rounded-sm bg-accent px-1.5 py-0.5 text-xs font-semibold text-primary">
                            {roleLabel(person)}
                          </span>
                        </TableCell>
                        <TableCell className={cn(sheetCellClassName, "text-muted-foreground")}>{person.email}</TableCell>
                        <TableCell className={sheetCellClassName}>
                          {person.phone || <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className={cn(sheetCellClassName, "border-r-0 px-1.5")}>
                          {person.isSuperAdmin ? (
                            <span className="px-1.5 text-xs text-muted-foreground">Cannot be moved</span>
                          ) : departments.length > 1 ? (
                            <select
                              className={cn(NATIVE_SELECT_CLASS, "rounded-sm bg-card")}
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
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
