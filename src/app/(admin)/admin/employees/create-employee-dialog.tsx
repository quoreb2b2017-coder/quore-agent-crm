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
import { minutesToTimeValue } from "@/lib/work-settings";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import {
  DEPARTMENT_KIND_OPTIONS,
  effectiveDepartmentKind,
  type AssignableRoleKey,
  type DepartmentKind,
} from "@/lib/departments";
import type { DepartmentOption } from "@/lib/queries/departments";
import type { AssignableDepartmentRole } from "@/lib/queries/assignable-roles";
import type { EmployeeDirectoryOption } from "@/lib/queries/employee-directory";
import { createEmployee, updateEmployee } from "./actions";

function rolesForKind(roles: AssignableDepartmentRole[], kind: string | null | undefined) {
  if (!kind) return [];
  const matched = roles.filter((role) => role.kind === kind);
  if (matched.length > 0) return matched;
  const builtIn =
    DEPARTMENT_KIND_OPTIONS.find((o) => o.kind === kind)?.roles ?? [];
  return builtIn.map((role) => ({
    roleKey: role.roleKey,
    label: role.label,
    kind: kind as DepartmentKind,
    description: null,
  }));
}

const EMPTY_FORM = {
  fullName: "",
  email: "",
  phone: "",
  workLocation: "",
  employeeCode: "",
  joiningDate: new Date().toLocaleDateString("en-CA"),
  dateOfBirth: "",
  password: "",
  confirmPassword: "",
};

type FormFields = typeof EMPTY_FORM;

export function CreateEmployeeDialog({
  trigger,
  redirectToOnboarding = false,
  employees = [],
  departments: initialDepartments = [],
  assignableRoles = [],
}: {
  trigger?: ReactNode;
  redirectToOnboarding?: boolean;
  employees?: EmployeeDirectoryOption[];
  departments?: DepartmentOption[];
  assignableRoles?: AssignableDepartmentRole[];
} = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [departments, setDepartments] = useState(initialDepartments);
  const [departmentId, setDepartmentId] = useState("");
  const [roleKey, setRoleKey] = useState<AssignableRoleKey | "">("");
  const [employeeId, setEmployeeId] = useState("");
  const [fields, setFields] = useState<FormFields>(EMPTY_FORM);

  const selectedDepartment = departments.find((row) => row.id === departmentId) ?? null;
  const selectedKind = selectedDepartment ? effectiveDepartmentKind(selectedDepartment) : null;
  const roleOptions = rolesForKind(assignableRoles, selectedKind);
  const allowedRoleKeys = new Set(roleOptions.map((role) => role.roleKey));

  const departmentEmployees =
    !departmentId || !selectedKind
      ? []
      : employees.filter((row) => {
          if (row.departmentId === departmentId) return true;
          return allowedRoleKeys.has(row.roleKey);
        });
  const selected = departmentEmployees.find((row) => row.id === employeeId) ?? null;
  const isExisting = Boolean(selected);

  function resetForm() {
    setDepartmentId("");
    setRoleKey("");
    setEmployeeId("");
    setFields(EMPTY_FORM);
    setDepartments(initialDepartments);
  }

  function applyEmployee(next: EmployeeDirectoryOption | null) {
    if (!next) {
      setFields({
        ...EMPTY_FORM,
        joiningDate: new Date().toLocaleDateString("en-CA"),
      });
      return;
    }
    setRoleKey(next.roleKey);
    setFields({
      fullName: next.fullName,
      email: next.email,
      phone: next.phone,
      // Existing people change their work location on their profile, not here.
      workLocation: "",
      employeeCode: next.employeeCode,
      joiningDate: next.joiningDate || new Date().toLocaleDateString("en-CA"),
      dateOfBirth: next.dateOfBirth,
      password: "",
      confirmPassword: "",
    });
  }

  function selectDepartment(nextId: string) {
    setDepartmentId(nextId);
    setEmployeeId("");
    applyEmployee(null);
    const dept = departments.find((row) => row.id === nextId) ?? null;
    const kind = dept ? effectiveDepartmentKind(dept) : null;
    const roles = rolesForKind(assignableRoles, kind);
    // Department → role hierarchy: always auto-fill the department’s role.
    setRoleKey(roles[0]?.roleKey ?? "");
  }

  function patchField<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  const { handleSubmit, isPending, error } = useActionForm(
    async (formData) => {
      if (!departmentId) return { error: "Pick a department" };
      if (!roleKey) return { error: "Pick a role for this department" };
      formData.set("departmentId", departmentId);
      formData.set("department", roleKey);
      if (selected?.schedule) {
        formData.set("customShift", "true");
        formData.set("login", minutesToTimeValue(selected.schedule.loginMinutes));
        formData.set("logout", minutesToTimeValue(selected.schedule.logoutMinutes));
      } else if (selected) {
        formData.set("customShift", "false");
        formData.set("skipWorkSchedule", "1");
      }
      if (selected) {
        return updateEmployee(selected.id, {}, formData);
      }
      return createEmployee({}, formData);
    },
    (result) => {
      toast.success(isExisting ? "Employee updated" : "Employee created · onboarding started");
      const nextId = result.employeeId ?? selected?.id;
      setOpen(false);
      resetForm();
      if (redirectToOnboarding && nextId) {
        router.push(`/admin/onboarding/${nextId}`);
      } else {
        router.refresh();
      }
    }
  );

  return (
    <FormSheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDepartments(initialDepartments);
        else resetForm();
      }}
      title="Add employee"
      description="Create a person and put them in a department. Role is filled automatically."
      onSubmit={handleSubmit}
      submitLabel={isExisting ? "Save employee" : "Create employee"}
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
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="departmentId">Department</Label>
        <select
          id="departmentId"
          name="departmentId"
          required
          value={departmentId}
          onChange={(event) => selectDepartment(event.target.value)}
          className={NATIVE_SELECT_CLASS}
        >
          <option value="" disabled>
            Select department
          </option>
          {departments.map((item) => {
            const kind = effectiveDepartmentKind(item);
            const kindRoles = new Set(
              rolesForKind(assignableRoles, kind).map((role) => role.roleKey)
            );
            const count = employees.filter((row) => {
              if (row.departmentId === item.id) return true;
              return row.departmentId == null && kindRoles.has(row.roleKey);
            }).length;
            return (
              <option key={item.id} value={item.id}>
                {item.name} ({count})
              </option>
            );
          })}
        </select>
        {selectedDepartment ? (
          <p className="text-sm text-muted-foreground">
            Role:{" "}
            <span className="font-medium text-foreground">
              {roleOptions.find((role) => role.roleKey === roleKey)?.label ??
                (roleOptions.map((role) => role.label).join(", ") || "—")}
            </span>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Create departments from Teams.
          </p>
        )}
        {/* Always submit role with the form; auto-filled from department. */}
        <input type="hidden" name="department" value={roleKey} />
      </div>

      {roleOptions.length > 1 ? (
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="rolePick">Role</Label>
          <select
            id="rolePick"
            value={roleKey}
            disabled={!selectedDepartment}
            onChange={(event) => setRoleKey(event.target.value as AssignableRoleKey | "")}
            className={NATIVE_SELECT_CLASS}
          >
            {roleOptions.map((item) => (
              <option key={item.roleKey} value={item.roleKey}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="existingEmployee">
          {departmentId
            ? `Employees in ${selectedDepartment?.name ?? "department"} (${departmentEmployees.length})`
            : "Employees"}
        </Label>
        <select
          id="existingEmployee"
          value={employeeId}
          disabled={!departmentId}
          onChange={(event) => {
            const nextId = event.target.value;
            setEmployeeId(nextId);
            applyEmployee(departmentEmployees.find((row) => row.id === nextId) ?? null);
          }}
          className={NATIVE_SELECT_CLASS}
        >
          <option value="">
            {departmentId ? "Create new employee" : "Select department first"}
          </option>
          {departmentEmployees.map((row) => (
            <option key={row.id} value={row.id}>
              {row.fullName} ({row.employeeCode})
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          name="fullName"
          required
          value={fields.fullName}
          onChange={(event) => patchField("fullName", event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="off"
          required
          value={fields.email}
          onChange={(event) => patchField("email", event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="phone">Phone number</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          required
          value={fields.phone}
          onChange={(event) => patchField("phone", event.target.value)}
        />
      </div>
      {isExisting ? null : (
        <div className="grid gap-2">
          <Label htmlFor="workLocation">
            Work location <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="workLocation"
            name="workLocation"
            placeholder="e.g. Pune office"
            maxLength={120}
            value={fields.workLocation}
            onChange={(event) => patchField("workLocation", event.target.value)}
          />
        </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor="employeeCode">Employee ID</Label>
        <Input
          id="employeeCode"
          name="employeeCode"
          required
          value={fields.employeeCode}
          onChange={(event) => patchField("employeeCode", event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="joiningDate">Date of joining</Label>
        <Input
          id="joiningDate"
          name="joiningDate"
          type="date"
          required
          value={fields.joiningDate}
          onChange={(event) => patchField("joiningDate", event.target.value)}
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
          value={fields.dateOfBirth}
          onChange={(event) => patchField("dateOfBirth", event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">{isExisting ? "New password (optional)" : "Password"}</Label>
        <PasswordInput
          id="password"
          name="password"
          minLength={isExisting ? undefined : 4}
          autoComplete="new-password"
          required={!isExisting}
          value={fields.password}
          onChange={(event) => patchField("password", event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirmPassword">
          {isExisting ? "Confirm new password" : "Confirm password"}
        </Label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          minLength={isExisting ? undefined : 4}
          autoComplete="new-password"
          required={!isExisting || fields.password.length > 0}
          value={fields.confirmPassword}
          onChange={(event) => patchField("confirmPassword", event.target.value)}
        />
      </div>
    </FormSheet>
  );
}
