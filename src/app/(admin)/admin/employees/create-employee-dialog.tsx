"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { FormSheet } from "@/components/ui/form-sheet";
import { useActionForm } from "@/hooks/use-action-form";
import { STAFF_DEPARTMENTS, type StaffRoleKey } from "@/lib/permissions/roles";
import { minutesToTimeValue } from "@/lib/work-settings";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import type { DepartmentOption } from "@/lib/queries/departments";
import type { EmployeeDirectoryOption } from "@/lib/queries/employee-directory";
import { createDepartment, createEmployee, updateEmployee } from "./actions";

const EMPTY_FORM = {
  fullName: "",
  email: "",
  phone: "",
  employeeCode: "",
  joiningDate: new Date().toLocaleDateString("en-CA"),
  dateOfBirth: "",
  password: "",
  confirmPassword: "",
};

type FormFields = typeof EMPTY_FORM;

const ADD_DEPARTMENT = "__add_department__";

export function CreateEmployeeDialog({
  trigger,
  redirectToOnboarding = false,
  employees = [],
  departments: initialDepartments = [],
}: {
  trigger?: ReactNode;
  redirectToOnboarding?: boolean;
  employees?: EmployeeDirectoryOption[];
  departments?: DepartmentOption[];
} = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [departments, setDepartments] = useState(initialDepartments);
  const [departmentId, setDepartmentId] = useState("");
  const [addingDepartment, setAddingDepartment] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [departmentBusy, setDepartmentBusy] = useState(false);
  const [departmentError, setDepartmentError] = useState<string | null>(null);
  const [roleKey, setRoleKey] = useState<StaffRoleKey | "">("");
  const [employeeId, setEmployeeId] = useState("");
  const [fields, setFields] = useState<FormFields>(EMPTY_FORM);

  const departmentEmployees = useMemo(
    () =>
      departmentId
        ? employees.filter((row) => row.departmentId === departmentId)
        : [],
    [departmentId, employees]
  );
  const selected = departmentEmployees.find((row) => row.id === employeeId) ?? null;
  const isExisting = Boolean(selected);

  function resetForm() {
    setDepartmentId("");
    setAddingDepartment(false);
    setNewDepartmentName("");
    setDepartmentError(null);
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
      employeeCode: next.employeeCode,
      joiningDate: next.joiningDate || new Date().toLocaleDateString("en-CA"),
      dateOfBirth: next.dateOfBirth,
      password: "",
      confirmPassword: "",
    });
  }

  function patchField<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function saveNewDepartment() {
    setDepartmentBusy(true);
    setDepartmentError(null);
    const formData = new FormData();
    formData.set("name", newDepartmentName);
    const result = await createDepartment({}, formData);
    setDepartmentBusy(false);
    if (result.error || !result.departmentId || !result.name) {
      setDepartmentError(result.error ?? "Could not add department");
      return;
    }
    const created = { id: result.departmentId, name: result.name };
    setDepartments((rows) =>
      [...rows.filter((row) => row.id !== created.id), created].sort((a, b) =>
        a.name.localeCompare(b.name)
      )
    );
    setDepartmentId(created.id);
    setAddingDepartment(false);
    setNewDepartmentName("");
    setEmployeeId("");
    applyEmployee(null);
    toast.success(`Department “${created.name}” added`);
  }

  const { handleSubmit, isPending, error } = useActionForm(
    async (formData) => {
      if (addingDepartment) return { error: "Finish adding the department first" };
      if (!departmentId) return { error: "Pick a department" };
      if (!roleKey) return { error: "Pick a role" };
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
      description="Pick or add a department, then a person. Existing profiles fill in automatically."
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
        {!addingDepartment ? (
          <select
            id="departmentId"
            name="departmentId"
            required
            value={departmentId}
            onChange={(event) => {
              const next = event.target.value;
              if (next === ADD_DEPARTMENT) {
                setAddingDepartment(true);
                setDepartmentError(null);
                return;
              }
              setDepartmentId(next);
              setEmployeeId("");
              applyEmployee(null);
            }}
            className={NATIVE_SELECT_CLASS}
          >
            <option value="" disabled>
              Select department
            </option>
            {departments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
            <option value={ADD_DEPARTMENT}>+ Add new department…</option>
          </select>
        ) : (
          <div className="grid gap-2 rounded-lg border bg-muted/20 p-3">
            <Label htmlFor="newDepartmentName">New department name</Label>
            <Input
              id="newDepartmentName"
              value={newDepartmentName}
              onChange={(event) => setNewDepartmentName(event.target.value)}
              placeholder="e.g. Sales, Support, QA"
              autoFocus
            />
            {departmentError ? (
              <p className="text-sm text-destructive">{departmentError}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={departmentBusy || newDepartmentName.trim().length < 2}
                onClick={() => void saveNewDepartment()}
              >
                {departmentBusy ? "Adding…" : "Add department"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={departmentBusy}
                onClick={() => {
                  setAddingDepartment(false);
                  setNewDepartmentName("");
                  setDepartmentError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="existingEmployee">Employee</Label>
        <select
          id="existingEmployee"
          value={employeeId}
          disabled={!departmentId || addingDepartment}
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
        <p className="text-xs text-muted-foreground">
          {departmentId
            ? isExisting
              ? "Existing details loaded — edit and save."
              : `${departmentEmployees.length} in this department · pick one or create new.`
            : "Choose a department to load its employees."}
        </p>
      </div>

      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="department">Role</Label>
        <select
          id="department"
          name="department"
          required
          value={roleKey}
          onChange={(event) => setRoleKey(event.target.value as StaffRoleKey | "")}
          className={NATIVE_SELECT_CLASS}
        >
          <option value="" disabled>
            Select role
          </option>
          {STAFF_DEPARTMENTS.map((item) => (
            <option key={item.roleKey} value={item.roleKey}>
              {item.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          App access type for this person (Agent, Database, or Email Marketing).
        </p>
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
