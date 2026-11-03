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
import type { EmployeeDirectoryOption } from "@/lib/queries/employee-directory";
import { createEmployee, updateEmployee } from "./actions";

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

export function CreateEmployeeDialog({
  trigger,
  redirectToOnboarding = false,
  employees = [],
}: {
  trigger?: ReactNode;
  redirectToOnboarding?: boolean;
  employees?: EmployeeDirectoryOption[];
} = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [department, setDepartment] = useState<StaffRoleKey | "">("");
  const [employeeId, setEmployeeId] = useState("");
  const [fields, setFields] = useState<FormFields>(EMPTY_FORM);

  const departmentEmployees = useMemo(
    () => (department ? employees.filter((row) => row.department === department) : []),
    [department, employees]
  );
  const selected = departmentEmployees.find((row) => row.id === employeeId) ?? null;
  const isExisting = Boolean(selected);

  function resetForm() {
    setDepartment("");
    setEmployeeId("");
    setFields(EMPTY_FORM);
  }

  function applyEmployee(next: EmployeeDirectoryOption | null) {
    if (!next) {
      setFields({
        ...EMPTY_FORM,
        joiningDate: new Date().toLocaleDateString("en-CA"),
      });
      return;
    }
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

  const { handleSubmit, isPending, error } = useActionForm(
    async (formData) => {
      formData.set("department", department);
      if (selected?.schedule) {
        formData.set("customShift", "true");
        formData.set("login", minutesToTimeValue(selected.schedule.loginMinutes));
        formData.set("logout", minutesToTimeValue(selected.schedule.logoutMinutes));
      } else if (selected) {
        // Profile-only save from this sheet — don't wipe an existing shift.
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
        if (!next) resetForm();
      }}
      title="Add employee"
      description="Pick a department, then a person. Existing profiles fill in automatically."
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
        <Label htmlFor="department">Department</Label>
        <select
          id="department"
          name="department"
          required
          value={department}
          onChange={(event) => {
            const next = event.target.value as StaffRoleKey | "";
            setDepartment(next);
            setEmployeeId("");
            applyEmployee(null);
          }}
          className={NATIVE_SELECT_CLASS}
        >
          <option value="" disabled>
            Select department
          </option>
          {STAFF_DEPARTMENTS.map((item) => (
            <option key={item.roleKey} value={item.roleKey}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="existingEmployee">Employee</Label>
        <select
          id="existingEmployee"
          value={employeeId}
          disabled={!department}
          onChange={(event) => {
            const nextId = event.target.value;
            setEmployeeId(nextId);
            applyEmployee(departmentEmployees.find((row) => row.id === nextId) ?? null);
          }}
          className={NATIVE_SELECT_CLASS}
        >
          <option value="">{department ? "Create new employee" : "Select department first"}</option>
          {departmentEmployees.map((row) => (
            <option key={row.id} value={row.id}>
              {row.fullName} ({row.employeeCode})
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {department
            ? isExisting
              ? "Existing details loaded — edit and save."
              : `${departmentEmployees.length} in this department · pick one or create new.`
            : "Choose a department to load its employees."}
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
