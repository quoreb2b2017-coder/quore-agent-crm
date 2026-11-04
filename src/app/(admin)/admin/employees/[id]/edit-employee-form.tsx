"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { STAFF_DEPARTMENTS, type StaffRoleKey } from "@/lib/permissions/roles";
import { formatDateTime } from "@/lib/format";
import {
  formatMinutesLabel,
  minutesToTimeValue,
  parseWorkSchedule,
  shiftSpansMidnight,
  timeValueToMinutes,
  timeZoneShort,
  type WorkSettings,
} from "@/lib/work-settings";
import { updateEmployee, type ActionState } from "../actions";
import type { Database } from "@/types/supabase";

const initialState: ActionState = {};

type Employee = Database["public"]["Tables"]["employees"]["Row"];

export function EditEmployeeForm({
  employee,
  dateOfBirth,
  personalEmail,
  currentDepartment,
  companySettings,
  lockDepartment = false,
}: {
  employee: Employee;
  dateOfBirth: string | null;
  personalEmail: string | null;
  currentDepartment: StaffRoleKey | "";
  companySettings: WorkSettings;
  lockDepartment?: boolean;
}) {
  const router = useRouter();
  const updateWithId = updateEmployee.bind(null, employee.id);
  const [state, formAction, isPending] = useActionState(updateWithId, initialState);
  const [department, setDepartment] = useState(currentDepartment);
  const savedSchedule = parseWorkSchedule(employee.work_schedule);
  const [customShift, setCustomShift] = useState(Boolean(savedSchedule));
  const [login, setLogin] = useState(
    minutesToTimeValue(savedSchedule?.loginMinutes ?? companySettings.loginMinutes)
  );
  const [logout, setLogout] = useState(
    minutesToTimeValue(savedSchedule?.logoutMinutes ?? companySettings.logoutMinutes)
  );

  useEffect(() => {
    if (state.success) {
      toast.success("Employee updated — shift times apply from the new login/logout");
      router.refresh();
    }
  }, [state.success, router]);

  const customLoginMinutes = timeValueToMinutes(login);
  const customLogoutMinutes = timeValueToMinutes(logout);
  const previewLogin = formatMinutesLabel(
    customShift && customLoginMinutes != null ? customLoginMinutes : companySettings.loginMinutes,
    companySettings.timeZone
  );
  const previewLogout = formatMinutesLabel(
    customShift && customLogoutMinutes != null ? customLogoutMinutes : companySettings.logoutMinutes,
    companySettings.timeZone
  );
  const overnight =
    customShift && customLoginMinutes != null && customLogoutMinutes != null
      ? shiftSpansMidnight({
          ...companySettings,
          loginMinutes: customLoginMinutes,
          logoutMinutes: customLogoutMinutes,
        })
      : shiftSpansMidnight(companySettings);

  return (
    <form action={formAction} className="grid gap-8">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h3 className="text-sm font-semibold">Account access</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Company email is used to sign in. You can also keep a personal email on the profile below.
            Existing passwords are encrypted and cannot be shown.
          </p>
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="email">Company email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={employee.email}
            required
            autoComplete="email"
            placeholder="name@company.com"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            name="password"
            minLength={4}
            autoComplete="new-password"
            placeholder="Leave blank to keep current"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            minLength={4}
            autoComplete="new-password"
            placeholder="Re-enter if changing"
          />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h3 className="text-sm font-semibold">Profile</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Name, ID, company and personal email, phone, joining date and birthday.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" name="fullName" defaultValue={employee.full_name} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="employeeCode">Employee ID</Label>
          <Input
            id="employeeCode"
            name="employeeCode"
            defaultValue={employee.employee_code}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="personalEmail">Personal email</Label>
          <Input
            id="personalEmail"
            name="personalEmail"
            type="email"
            defaultValue={personalEmail ?? ""}
            autoComplete="email"
            placeholder="name@gmail.com"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="phone">Phone number</Label>
          <Input id="phone" name="phone" type="tel" defaultValue={employee.phone ?? ""} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="joiningDate">Date of joining</Label>
          <Input
            id="joiningDate"
            name="joiningDate"
            type="date"
            defaultValue={employee.joining_date ?? ""}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="dateOfBirth">Date of birth</Label>
          <Input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={dateOfBirth ?? ""} />
        </div>
        {!lockDepartment ? (
          <div className="grid gap-2">
            <Label htmlFor="department">Department</Label>
            <select
              id="department"
              name="department"
              required
              value={department || ""}
              onChange={(event) => setDepartment((event.target.value || "") as StaffRoleKey | "")}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
        ) : null}
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h3 className="text-sm font-semibold">Shift timing</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Set this employee&apos;s login and logout. Late, productive time, and shift end follow these times
            ({timeZoneShort(companySettings.timeZone)}). Leave off to use the company shift from Work settings.
          </p>
        </div>
        <label className="flex items-start gap-3 rounded-lg border bg-muted/20 px-3 py-3 sm:col-span-2">
          <input
            type="checkbox"
            name="customShift"
            value="true"
            checked={customShift}
            onChange={(event) => setCustomShift(event.target.checked)}
            className="mt-0.5 size-4 rounded border-input"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium">Custom login / logout for this employee</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Company default: {formatMinutesLabel(companySettings.loginMinutes, companySettings.timeZone)} –{" "}
              {formatMinutesLabel(companySettings.logoutMinutes, companySettings.timeZone)}
            </span>
          </span>
        </label>
        {customShift ? (
          <>
            <div className="grid gap-2">
              <Label htmlFor="login">Login time</Label>
              <Input
                id="login"
                name="login"
                type="time"
                required
                value={login}
                onChange={(event) => setLogin(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="logout">Logout time</Label>
              <Input
                id="logout"
                name="logout"
                type="time"
                required
                value={logout}
                onChange={(event) => setLogout(event.target.value)}
              />
            </div>
          </>
        ) : (
          <>
            <input type="hidden" name="login" value={login} />
            <input type="hidden" name="logout" value={logout} />
          </>
        )}
        <p className="text-xs text-muted-foreground sm:col-span-2">
          Effective shift: {previewLogin} – {previewLogout}
          {overnight ? " (overnight)" : ""}. Signing in after login is marked Late.
          {savedSchedule?.updatedAt
            ? ` Last assigned/updated ${formatDateTime(savedSchedule.updatedAt)}.`
            : customShift
              ? " Save to record when this shift was assigned."
              : ""}
        </p>
      </section>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save profile
        </Button>
      </div>
    </form>
  );
}
