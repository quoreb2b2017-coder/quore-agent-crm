"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { STAFF_DEPARTMENTS, type StaffRoleKey } from "@/lib/permissions/roles";
import { updateEmployee, type ActionState } from "../actions";
import type { Database } from "@/types/supabase";

const initialState: ActionState = {};

type Employee = Database["public"]["Tables"]["employees"]["Row"];

export function EditEmployeeForm({
  employee,
  currentDepartment,
  lockDepartment = false,
}: {
  employee: Employee;
  currentDepartment: StaffRoleKey | "";
  lockDepartment?: boolean;
}) {
  const updateWithId = updateEmployee.bind(null, employee.id);
  const [state, formAction, isPending] = useActionState(updateWithId, initialState);
  const [department, setDepartment] = useState(currentDepartment);

  useEffect(() => {
    if (state.success) toast.success("Employee updated");
  }, [state.success]);

  return (
    <form action={formAction} className="grid gap-8">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h3 className="text-sm font-semibold">Account access</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Super Admin can view email and set a new login password. Existing passwords are encrypted and cannot be shown.
          </p>
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={employee.email} required />
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
          <p className="mt-0.5 text-xs text-muted-foreground">Name, ID, and contact details for this employee.</p>
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
          <Label htmlFor="phone">Phone number</Label>
          <Input id="phone" name="phone" type="tel" defaultValue={employee.phone ?? ""} required />
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
