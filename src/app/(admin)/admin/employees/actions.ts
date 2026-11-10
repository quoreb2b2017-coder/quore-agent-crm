"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentEmployeeContext, hasPermission } from "@/lib/permissions/server";
import {
  isHr,
  isManagement,
  isSuperAdmin,
  SUPER_ADMIN_ROLE,
} from "@/lib/permissions/roles";
import {
  isDepartmentKind,
  roleAllowedForKind,
  type DepartmentKind,
} from "@/lib/departments";
import { isSuperAdminEmployee } from "@/lib/queries/admin-dashboard";
import {
  parseWorkSchedule,
  timeValueToMinutes,
  workSchedulePayload,
  type WorkSchedule,
} from "@/lib/work-settings";
import { forgetEmployeeSchedule, validateWorkSchedule } from "@/lib/work-settings-server";
import { notifyAdminsOfAction } from "@/lib/realtime/notify";
import type { Json } from "@/types/supabase";

/** Any role key under a department (built-in or custom). */
const assignableRole = z
  .string()
  .trim()
  .min(2, "Pick a role")
  .regex(/^[A-Z][A-Z0-9_]*$/, "Invalid role");
const departmentKindSchema = z.enum([
  "ADMIN_CONTROL",
  "SALES",
  "MARKETING",
  "DATABASE",
  "IT",
]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const joiningDateSchema = z.string().regex(ISO_DATE, "Pick the date of joining");

const dateOfBirthSchema = z
  .string()
  .regex(ISO_DATE, "Pick the date of birth")
  .refine((value) => {
    const age = new Date().getFullYear() - Number(value.slice(0, 4));
    return age >= 14 && age <= 90;
  }, "Date of birth looks wrong");

const createSchema = z
  .object({
    fullName: z.string().min(1, "Full name is required"),
    email: z.email("Enter a valid email"),
    phone: z.string().min(1, "Phone number is required"),
    employeeCode: z.string().min(1, "Employee ID is required"),
    password: z.string().min(4, "Password must be at least 4 characters"),
    confirmPassword: z.string().min(1, "Confirm password"),
    /** App role under the selected department kind. */
    department: assignableRole,
    /** Org department from public.departments. */
    departmentId: z.string().uuid("Pick a department"),
    joiningDate: joiningDateSchema,
    dateOfBirth: dateOfBirthSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ShiftFields = { customShift: boolean; login?: string; logout?: string };

function checkShiftTimes(data: ShiftFields, ctx: z.RefinementCtx) {
  if (!data.customShift) return;
  const loginMinutes = timeValueToMinutes(data.login ?? "");
  const logoutMinutes = timeValueToMinutes(data.logout ?? "");
  if (loginMinutes == null) {
    ctx.addIssue({ code: "custom", message: "Pick a login time", path: ["login"] });
    return;
  }
  if (logoutMinutes == null) {
    ctx.addIssue({ code: "custom", message: "Pick a logout time", path: ["logout"] });
    return;
  }
  const scheduleError = validateWorkSchedule({ loginMinutes, logoutMinutes });
  if (scheduleError) {
    ctx.addIssue({ code: "custom", message: scheduleError, path: ["login"] });
  }
}

const updateSchema = z
  .object({
    fullName: z.string().min(1, "Full name is required"),
    email: z.email("Enter a valid company email"),
    personalEmail: z
      .string()
      .trim()
      .refine((value) => !value || z.email().safeParse(value).success, "Enter a valid personal email")
      .transform((value) => value || null)
      .optional(),
    phone: z.string().min(1, "Phone number is required"),
    employeeCode: z.string().min(1, "Employee ID is required"),
    department: assignableRole.optional(),
    departmentId: z.string().uuid().optional(),
    joiningDate: joiningDateSchema.optional(),
    dateOfBirth: dateOfBirthSchema.optional(),
    password: z.string().optional(),
    confirmPassword: z.string().optional(),
    customShift: z.boolean(),
    login: z.string().optional(),
    logout: z.string().optional(),
  })
  .refine(
    (data) => !data.password || data.password.length >= 4,
    { message: "Password must be at least 4 characters", path: ["password"] }
  )
  .refine(
    (data) => !data.password || data.password === data.confirmPassword,
    { message: "Passwords do not match", path: ["confirmPassword"] }
  )
  .superRefine(checkShiftTimes);

const shiftSchema = z
  .object({
    customShift: z.boolean(),
    login: z.string().optional(),
    logout: z.string().optional(),
  })
  .superRefine(checkShiftTimes);

function scheduleFromUpdate(data: ShiftFields): WorkSchedule | null {
  if (!data.customShift) return null;
  const loginMinutes = timeValueToMinutes(data.login ?? "");
  const logoutMinutes = timeValueToMinutes(data.logout ?? "");
  if (loginMinutes == null || logoutMinutes == null) return null;
  return { loginMinutes, logoutMinutes };
}

export type ActionState = { error?: string; success?: boolean; employeeId?: string };
export type DepartmentActionState = {
  error?: string;
  success?: boolean;
  departmentId?: string;
  name?: string;
  kind?: DepartmentKind;
};

async function assertCanManageEmployees() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !hasPermission(ctx, "employees.manage")) {
    throw new Error("You do not have permission to manage employees.");
  }
  return ctx;
}

async function notifyDepartmentChange(action: string) {
  const ctx = await getCurrentEmployeeContext();
  if (ctx) notifyAdminsOfAction(ctx, action);
}

/** HR may manage staff only, never Super Admin or other HR accounts. */
async function assertCanManageTarget(
  ctx: { roleKey: string },
  employeeId: string
): Promise<string | null> {
  if (isSuperAdmin(ctx.roleKey)) return null;
  const supabase = await createClient();
  if (await isSuperAdminEmployee(supabase, employeeId)) {
    return "Only Super Admin can change this account.";
  }
  return null;
}

async function employeeIsLastSuperAdmin(employeeId: string) {
  const service = createServiceClient();
  const { data: role } = await service
    .from("roles")
    .select("id")
    .eq("role_key", SUPER_ADMIN_ROLE)
    .maybeSingle();
  if (!role) return false;

  const { data: assignment } = await service
    .from("employee_roles")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("role_id", role.id)
    .maybeSingle();
  if (!assignment) return false;

  const { count } = await service
    .from("employee_roles")
    .select("id", { count: "exact", head: true })
    .eq("role_id", role.id);
  return (count ?? 0) <= 1;
}

const createDepartmentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Department name is too short")
    .max(80, "Department name is too long"),
  kind: departmentKindSchema,
  /** When set, also create a custom role under this department kind. */
  newRoleName: z
    .string()
    .trim()
    .min(2, "Role name is too short")
    .max(80, "Role name is too long")
    .optional(),
  newRoleKey: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]*$/, "Use UPPER_SNAKE_CASE for the role key")
    .optional(),
});

const renameDepartmentSchema = z.object({
  departmentId: z.string().uuid(),
  name: z
    .string()
    .trim()
    .min(2, "Department name is too short")
    .max(80, "Department name is too long"),
  kind: departmentKindSchema.optional(),
});

function roleKeyFromLabel(label: string) {
  const key = label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return key.length >= 2 ? key : "";
}

/** Create an org department with a role-group kind. Optionally add a new role (Other). */
export async function createDepartment(
  _prev: DepartmentActionState,
  formData: FormData
): Promise<DepartmentActionState> {
  try {
    await assertCanManageEmployees();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not authorized" };
  }

  const roleNameRaw = String(formData.get("newRoleName") ?? "").trim();
  const roleKeyRaw = String(formData.get("newRoleKey") ?? "")
    .trim()
    .toUpperCase();
  const parsed = createDepartmentSchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    newRoleName: roleNameRaw || undefined,
    newRoleKey: roleKeyRaw || (roleNameRaw ? roleKeyFromLabel(roleNameRaw) : undefined),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid department" };
  }

  if (roleNameRaw && !parsed.data.newRoleKey) {
    return { error: "Enter a role name so we can build a role key" };
  }

  const name = parsed.data.name.replace(/\s+/g, " ");
  const supabase = await createClient();

  if (parsed.data.newRoleName && parsed.data.newRoleKey) {
    const { error: roleError } = await supabase.from("roles").insert({
      role_key: parsed.data.newRoleKey,
      display_name: parsed.data.newRoleName.replace(/\s+/g, " "),
      description: `Custom role for ${name}`,
      department_kind: parsed.data.kind,
      is_system: false,
    });
    if (roleError) {
      if (/duplicate|unique/i.test(roleError.message)) {
        return { error: "That role key already exists — pick another role name" };
      }
      if (/column.*department_kind/i.test(roleError.message)) {
        return {
          error: "Run supabase/migrations/0033_role_department_kind.sql in Supabase first.",
        };
      }
      return { error: roleError.message };
    }
  }

  const { data, error } = await supabase
    .from("departments")
    .insert({ name, kind: parsed.data.kind })
    .select("id, name, kind")
    .single();

  if (error) {
    if (/kind/i.test(error.message) && /column/i.test(error.message)) {
      return {
        error: "Run supabase/migrations/0032_department_kinds.sql in Supabase first.",
      };
    }
    if (/duplicate|unique/i.test(error.message)) {
      return { error: "That department already exists" };
    }
    return { error: error.message };
  }

  revalidatePath("/admin/employees");
  revalidatePath("/admin/teams");
  revalidatePath("/admin/roles");
  revalidatePath("/admin/onboarding");
  await notifyDepartmentChange(`created the department ${data.name}`);
  return {
    success: true,
    departmentId: data.id,
    name: data.name,
    kind: parsed.data.kind,
  };
}

/** Edit a department name and/or role-group type. */
export async function renameDepartment(
  _prev: DepartmentActionState,
  formData: FormData
): Promise<DepartmentActionState> {
  try {
    await assertCanManageEmployees();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not authorized" };
  }

  const kindRaw = String(formData.get("kind") ?? "").trim();
  const parsed = renameDepartmentSchema.safeParse({
    departmentId: formData.get("departmentId"),
    name: formData.get("name"),
    kind: kindRaw || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid department" };
  }

  const name = parsed.data.name.replace(/\s+/g, " ");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("departments")
    .update({
      name,
      ...(parsed.data.kind ? { kind: parsed.data.kind } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.departmentId)
    .select("id, name, kind")
    .single();

  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      return { error: "That department name is already used" };
    }
    return { error: error.message };
  }

  revalidatePath("/admin/employees");
  revalidatePath("/admin/teams");
  revalidatePath("/admin/onboarding");
  await notifyDepartmentChange(`updated the department ${data.name}`);
  return {
    success: true,
    departmentId: data.id,
    name: data.name,
    kind: data.kind && isDepartmentKind(data.kind) ? data.kind : parsed.data.kind,
  };
}

const deleteDepartmentSchema = z.object({
  departmentId: z.string().uuid(),
});

/** Delete a department. Employees keep their roles; department_id is cleared by FK. */
export async function deleteDepartment(
  _prev: DepartmentActionState,
  formData: FormData
): Promise<DepartmentActionState> {
  try {
    await assertCanManageEmployees();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not authorized" };
  }

  const parsed = deleteDepartmentSchema.safeParse({
    departmentId: formData.get("departmentId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Pick a department" };
  }

  const supabase = await createClient();
  const { data: existing, error: loadError } = await supabase
    .from("departments")
    .select("id, name")
    .eq("id", parsed.data.departmentId)
    .maybeSingle();
  if (loadError || !existing) {
    return { error: loadError?.message ?? "Department not found" };
  }

  const { count } = await supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("department_id", existing.id)
    .neq("employment_status", "TERMINATED");

  // Unlink first so delete never fails if ON DELETE SET NULL is missing.
  if ((count ?? 0) > 0) {
    const { error: clearError } = await supabase
      .from("employees")
      .update({ department_id: null, updated_at: new Date().toISOString() })
      .eq("department_id", existing.id);
    if (clearError) return { error: clearError.message };
  }

  const { error } = await supabase.from("departments").delete().eq("id", existing.id);
  if (error) return { error: error.message };

  revalidatePath("/admin/employees");
  revalidatePath("/admin/teams");
  revalidatePath("/admin/onboarding");
  await notifyDepartmentChange(`deleted the department ${existing.name}`);
  return { success: true, departmentId: existing.id, name: existing.name };
}

const assignEmployeeSchema = z.object({
  departmentId: z.string().uuid("Pick a department"),
  employeeId: z.string().uuid("Pick an employee"),
  roleKey: assignableRole,
});

/** Put an existing employee into a department and set their app role. */
export async function assignEmployeeToDepartment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let ctx;
  try {
    ctx = await assertCanManageEmployees();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not authorized" };
  }

  const parsed = assignEmployeeSchema.safeParse({
    departmentId: String(formData.get("departmentId") ?? "").trim(),
    employeeId: String(formData.get("employeeId") ?? "").trim(),
    roleKey: formData.get("roleKey"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid assignment" };
  }

  const { departmentId, employeeId, roleKey } = parsed.data;
  if (isHr(roleKey) && !isSuperAdmin(ctx.roleKey)) {
    return { error: "Only Super Admin can assign the HR role" };
  }

  const blocked = await assertCanManageTarget(ctx, employeeId);
  if (blocked) return { error: blocked };

  // Moving someone sets the role of the new team, which takes Super Admin access away.
  // Only another Super Admin may do that, never to themselves or to the last one.
  const { data: superAdminRole } = await createServiceClient()
    .from("employee_roles")
    .select("id, roles!inner(role_key)")
    .eq("employee_id", employeeId)
    .eq("roles.role_key", SUPER_ADMIN_ROLE)
    .limit(1);
  if (superAdminRole?.length) {
    if (!isSuperAdmin(ctx.roleKey)) return { error: "Only Super Admin can move a Super Admin into a team." };
    if (employeeId === ctx.employeeId) return { error: "You cannot remove your own Super Admin role." };
    if (await employeeIsLastSuperAdmin(employeeId)) return { error: "You cannot remove the last Super Admin." };
  }

  const mismatch = await assertRoleMatchesDepartment(departmentId, roleKey);
  if (mismatch) return { error: mismatch };

  let roleId: string;
  try {
    roleId = await roleIdForKey(roleKey);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Role not found" };
  }

  const supabase = await createClient();
  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id")
    .eq("id", employeeId)
    .maybeSingle();
  if (employeeError || !employee) {
    return { error: employeeError?.message ?? "Employee not found" };
  }

  const { error: deptError } = await supabase
    .from("employees")
    .update({ department_id: departmentId, updated_at: new Date().toISOString() })
    .eq("id", employeeId);
  if (deptError) return { error: deptError.message };

  const { data: currentRole } = await supabase
    .from("employee_roles")
    .select("id, role_id")
    .eq("employee_id", employeeId)
    .eq("is_primary", true)
    .maybeSingle();

  if (currentRole) {
    if (currentRole.role_id !== roleId) {
      const { error: roleError } = await supabase
        .from("employee_roles")
        .update({ role_id: roleId })
        .eq("id", currentRole.id);
      if (roleError) return { error: roleError.message };
    }
  } else {
    const { error: roleError } = await supabase.from("employee_roles").insert({
      employee_id: employeeId,
      role_id: roleId,
      is_primary: true,
    });
    if (roleError) return { error: roleError.message };
  }

  revalidatePath("/admin/employees");
  revalidatePath("/admin/teams");
  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath("/admin/onboarding");
  notifyAdminsOfAction(ctx, "changed the team and role of", { targetEmployeeId: employeeId });
  return { success: true, employeeId };
}

async function roleIdForKey(roleKey: string) {
  const supabase = await createClient();
  const { data: role, error } = await supabase
    .from("roles")
    .select("id, department_kind")
    .eq("role_key", roleKey)
    .maybeSingle();

  if (error || !role) {
    throw new Error(
      "That role is missing. Create it under Manage roles, or run scripts/sync-staff-roles.sql."
    );
  }
  return role.id;
}

async function roleKindForKey(roleKey: string): Promise<DepartmentKind | null> {
  const supabase = await createClient();
  const { data: role } = await supabase
    .from("roles")
    .select("role_key, department_kind")
    .eq("role_key", roleKey)
    .maybeSingle();
  if (!role) return null;
  const { kindForAssignableRole, normalizeDepartmentKind } = await import(
    "@/lib/departments"
  );
  const normalized = normalizeDepartmentKind(role.department_kind);
  if (normalized) {
    if (role.department_kind === "MANAGEMENT" && role.role_key === "EMAIL_MARKETING") {
      return "MARKETING";
    }
    return normalized;
  }
  return kindForAssignableRole(role.role_key);
}

async function departmentKindForId(departmentId: string): Promise<DepartmentKind | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("departments")
    .select("kind, name")
    .eq("id", departmentId)
    .maybeSingle();
  if (!data) return null;
  const { normalizeDepartmentKind } = await import("@/lib/departments");
  return normalizeDepartmentKind(data.kind, data.name);
}

async function assertRoleMatchesDepartment(departmentId: string, roleKey: string) {
  const kind = await departmentKindForId(departmentId);
  if (!kind) return "Pick a department";
  const roleKind = await roleKindForKey(roleKey);
  if (roleKind) {
    return roleKind === kind
      ? null
      : "That role does not belong to the selected department";
  }
  // Fallback when department_kind column is not migrated yet.
  return roleAllowedForKind(kind, roleKey)
    ? null
    : "That role does not belong to the selected department";
}

export async function createEmployee(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let ctx;
  try {
    ctx = await assertCanManageEmployees();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not authorized" };
  }

  const parsed = createSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    employeeCode: String(formData.get("employeeCode") ?? "").trim(),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    department: formData.get("department"),
    departmentId: String(formData.get("departmentId") ?? "").trim(),
    joiningDate: String(formData.get("joiningDate") ?? ""),
    dateOfBirth: String(formData.get("dateOfBirth") ?? ""),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const data = parsed.data;
  if (isHr(data.department) && !isSuperAdmin(ctx.roleKey)) {
    return { error: "Only Super Admin can add HR accounts" };
  }

  const supabase = await createClient();
  const service = createServiceClient();

  const { data: departmentRow, error: departmentError } = await supabase
    .from("departments")
    .select("id, kind, name")
    .eq("id", data.departmentId)
    .maybeSingle();
  if (departmentError || !departmentRow) {
    return { error: departmentError?.message ?? "Pick a department" };
  }
  const mismatch = await assertRoleMatchesDepartment(data.departmentId, data.department);
  if (mismatch) return { error: mismatch };

  let roleId: string;
  try {
    roleId = await roleIdForKey(data.department);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Role not found" };
  }

  const { data: authUser, error: authError } = await service.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
    user_metadata: { full_name: data.fullName },
  });

  if (authError || !authUser.user) {
    return { error: authError?.message ?? "Failed to create login" };
  }

  const { data: employee, error: insertError } = await supabase
    .from("employees")
    .insert({
      employee_code: data.employeeCode,
      full_name: data.fullName,
      email: data.email,
      phone: data.phone,
      auth_user_id: authUser.user.id,
      employment_status: "ACTIVE",
      joining_date: data.joiningDate,
      department_id: data.departmentId,
    })
    .select("id")
    .single();

  if (insertError || !employee) {
    await service.auth.admin.deleteUser(authUser.user.id);
    return { error: insertError?.message ?? "Failed to create employee" };
  }

  const { error: roleError } = await supabase.from("employee_roles").insert({
    employee_id: employee.id,
    role_id: roleId,
    is_primary: true,
  });

  if (roleError) {
    return { error: `Employee created, but department assignment failed: ${roleError.message}` };
  }

  await supabase
    .from("employee_onboarding")
    .upsert(
      { employee_id: employee.id, date_of_birth: data.dateOfBirth },
      { onConflict: "employee_id" }
    );

  revalidatePath("/admin/employees");
  revalidatePath("/admin/onboarding");
  notifyAdminsOfAction(ctx, "added the employee", { targetEmployeeId: employee.id });
  return { success: true, employeeId: employee.id };
}

export async function updateEmployee(
  employeeId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let ctx;
  try {
    ctx = await assertCanManageEmployees();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not authorized" };
  }
  const blocked = await assertCanManageTarget(ctx, employeeId);
  if (blocked) return { error: blocked };

  const password = String(formData.get("password") ?? "");
  const departmentValue = String(formData.get("department") ?? "").trim();
  const departmentIdValue = String(formData.get("departmentId") ?? "").trim();
  const parsed = updateSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    personalEmail: String(formData.get("personalEmail") ?? "").trim(),
    phone: formData.get("phone"),
    employeeCode: String(formData.get("employeeCode") ?? "").trim(),
    department: departmentValue || undefined,
    departmentId: departmentIdValue || undefined,
    joiningDate: String(formData.get("joiningDate") ?? "") || undefined,
    dateOfBirth: String(formData.get("dateOfBirth") ?? "") || undefined,
    password: password || undefined,
    confirmPassword: formData.get("confirmPassword") || undefined,
    customShift: formData.get("customShift") === "on" || formData.get("customShift") === "true",
    login: String(formData.get("login") ?? "") || undefined,
    logout: String(formData.get("logout") ?? "") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const data = parsed.data;
  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("employees")
    .select("auth_user_id, work_schedule")
    .eq("id", employeeId)
    .single();

  if (existingError || !existing) {
    return { error: existingError?.message ?? "Employee not found" };
  }

  const previousSchedule = parseWorkSchedule(existing.work_schedule);
  const skipWorkSchedule = formData.get("skipWorkSchedule") === "1";
  const workSchedule = workSchedulePayload(scheduleFromUpdate(data), previousSchedule) as Json;

  if (data.departmentId) {
    const { data: departmentRow, error: departmentError } = await supabase
      .from("departments")
      .select("id")
      .eq("id", data.departmentId)
      .maybeSingle();
    if (departmentError || !departmentRow) {
      return { error: departmentError?.message ?? "Pick a department" };
    }
  }

  const { error: updateError } = await supabase
    .from("employees")
    .update({
      employee_code: data.employeeCode,
      full_name: data.fullName,
      email: data.email,
      phone: data.phone,
      updated_at: new Date().toISOString(),
      ...(data.joiningDate ? { joining_date: data.joiningDate } : {}),
      ...(data.departmentId ? { department_id: data.departmentId } : {}),
      ...(skipWorkSchedule ? {} : { work_schedule: workSchedule }),
    })
    .eq("id", employeeId);

  if (updateError) {
    return { error: updateError.message };
  }

  if (data.dateOfBirth !== undefined || data.personalEmail !== undefined) {
    const { error: onboardingError } = await supabase.from("employee_onboarding").upsert(
      {
        employee_id: employeeId,
        ...(data.dateOfBirth ? { date_of_birth: data.dateOfBirth } : {}),
        ...(data.personalEmail !== undefined ? { personal_email: data.personalEmail } : {}),
      },
      { onConflict: "employee_id" }
    );
    if (onboardingError) {
      return { error: `Profile saved, but personal email/birthday failed: ${onboardingError.message}` };
    }
  }

  if (data.department) {
    const { data: currentRole } = await supabase
      .from("employee_roles")
      .select("id, role_id")
      .eq("employee_id", employeeId)
      .eq("is_primary", true)
      .maybeSingle();

    let currentRoleKey = "";
    if (currentRole) {
      const { data: role } = await supabase
        .from("roles")
        .select("role_key")
        .eq("id", currentRole.role_id)
        .maybeSingle();
      currentRoleKey = role?.role_key ?? "";
    }

    if (!isManagement(currentRoleKey) || (isHr(currentRoleKey) && isSuperAdmin(ctx.roleKey))) {
      if (isHr(data.department) && !isSuperAdmin(ctx.roleKey)) {
        return { error: "Only Super Admin can assign the HR role" };
      }
      if (data.departmentId) {
        const mismatch = await assertRoleMatchesDepartment(data.departmentId, data.department);
        if (mismatch) return { error: mismatch };
      }
      let roleId: string;
      try {
        roleId = await roleIdForKey(data.department);
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Role not found" };
      }

      if (currentRole && currentRole.role_id !== roleId) {
        await supabase.from("employee_roles").update({ role_id: roleId }).eq("id", currentRole.id);
      } else if (!currentRole) {
        await supabase.from("employee_roles").insert({
          employee_id: employeeId,
          role_id: roleId,
          is_primary: true,
        });
      }
    }
  }

  if (existing.auth_user_id) {
    const service = createServiceClient();
    const authUpdate: { email: string; password?: string; user_metadata: { full_name: string } } = {
      email: data.email,
      user_metadata: { full_name: data.fullName },
    };
    if (data.password) authUpdate.password = data.password;
    const { error: authError } = await service.auth.admin.updateUserById(
      existing.auth_user_id,
      authUpdate
    );
    if (authError) return { error: authError.message };
  }

  revalidateShiftPages(employeeId);
  if (!skipWorkSchedule) await refreshTodayAfterShiftChange(employeeId, previousSchedule, workSchedule);

  notifyAdminsOfAction(ctx, "updated the profile of", {
    targetEmployeeId: employeeId,
    detail: data.password ? "The password was also changed." : undefined,
  });
  return { success: true, employeeId };
}

/** A shift change must refresh the employee's portal clock (login/logout window). */
function revalidateShiftPages(employeeId: string) {
  forgetEmployeeSchedule(employeeId);
  revalidatePath("/", "layout");
  revalidatePath("/portal", "layout");
  revalidatePath("/portal/dashboard");
  revalidatePath("/portal/attendance");
  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath(`/admin/onboarding/${employeeId}`);
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/attendance");
}

/**
 * Never recompute past days with the new schedule — that zeroed out previous
 * shift work and showed huge "minus / short" deficits. Only refresh today,
 * and recomputeShiftTotals uses the day's frozen shift snapshot when present.
 */
async function refreshTodayAfterShiftChange(
  employeeId: string,
  previous: WorkSchedule | null,
  workSchedule: Json
) {
  try {
    const next = parseWorkSchedule(workSchedule);
    const timesChanged =
      (previous?.loginMinutes ?? null) !== (next?.loginMinutes ?? null) ||
      (previous?.logoutMinutes ?? null) !== (next?.logoutMinutes ?? null);
    if (timesChanged) {
      const { todayIso } = await import("@/lib/format");
      const { recomputeShiftTotals } = await import("@/lib/actions/attendance");
      const service = createServiceClient();
      const today = todayIso();
      const { data: day } = await service
        .from("attendance")
        .select("attendance_date, overtime_minutes, status")
        .eq("employee_id", employeeId)
        .eq("attendance_date", today)
        .maybeSingle();
      if (
        day &&
        day.status !== "ON_LEAVE" &&
        day.status !== "HOLIDAY" &&
        day.status !== "WEEK_OFF"
      ) {
        await recomputeShiftTotals(employeeId, day.attendance_date, day.overtime_minutes ?? 0);
      }
    }
  } catch {
    /* shift is saved; totals catch up on next clock-out */
  }
}

/** Saves only this employee's login/logout, from the Shift & overtime tab. */
export async function updateEmployeeShift(
  employeeId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let ctx;
  try {
    ctx = await assertCanManageEmployees();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not authorized" };
  }
  const blocked = await assertCanManageTarget(ctx, employeeId);
  if (blocked) return { error: blocked };

  const parsed = shiftSchema.safeParse({
    customShift: formData.get("customShift") === "true",
    login: String(formData.get("login") ?? "") || undefined,
    logout: String(formData.get("logout") ?? "") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the shift times" };
  }

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("employees")
    .select("work_schedule")
    .eq("id", employeeId)
    .single();
  if (existingError || !existing) {
    return { error: existingError?.message ?? "Employee not found" };
  }

  const previousSchedule = parseWorkSchedule(existing.work_schedule);
  const workSchedule = workSchedulePayload(scheduleFromUpdate(parsed.data), previousSchedule) as Json;
  const { error: updateError } = await supabase
    .from("employees")
    .update({ work_schedule: workSchedule, updated_at: new Date().toISOString() })
    .eq("id", employeeId);
  if (updateError) return { error: updateError.message };

  revalidateShiftPages(employeeId);
  await refreshTodayAfterShiftChange(employeeId, previousSchedule, workSchedule);
  notifyAdminsOfAction(ctx, "changed the shift of", { targetEmployeeId: employeeId });
  return { success: true, employeeId };
}

const optionalHrText = z
  .string()
  .trim()
  .max(500)
  .transform((value) => value || null);

const personalDetailsSchema = z.object({
  joiningDate: z.string().regex(ISO_DATE, "Pick the joining date"),
  workLocation: optionalHrText,
  dateOfBirth: z
    .string()
    .trim()
    .refine((value) => !value || ISO_DATE.test(value), "Pick a valid date of birth")
    .transform((value) => value || null),
  gender: optionalHrText,
  personalEmail: z
    .string()
    .trim()
    .refine((value) => !value || z.email().safeParse(value).success, "Enter a valid personal email")
    .transform((value) => value || null),
  currentAddress: z
    .string()
    .trim()
    .max(2000)
    .transform((value) => value || null),
  permanentAddress: z
    .string()
    .trim()
    .max(2000)
    .transform((value) => value || null),
  emergencyContactName: optionalHrText,
  emergencyContactRelation: optionalHrText,
  emergencyContactPhone: z
    .string()
    .trim()
    .refine((value) => !value || /^[+\d][\d\s-]{6,18}$/.test(value), "Enter a valid emergency phone")
    .transform((value) => value || null),
  panNumber: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => !value || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value), "PAN should look like ABCDE1234F")
    .transform((value) => value || null),
  aadhaarNumber: z
    .string()
    .transform((value) => value.replace(/\s+/g, ""))
    .refine((value) => !value || /^\d{12}$/.test(value), "Aadhaar should be 12 digits")
    .transform((value) => value || null),
  previousCompany: optionalHrText,
  notes: z
    .string()
    .trim()
    .max(2000)
    .transform((value) => value || null),
  bankAccountHolder: optionalHrText,
  bankName: optionalHrText,
  bankAccountNumber: z
    .string()
    .transform((value) => value.replace(/\s+/g, ""))
    .refine((value) => !value || /^\d{6,20}$/.test(value), "Account number should be 6–20 digits")
    .transform((value) => value || null),
  bankIfsc: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => !value || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value), "IFSC should look like HDFC0001234")
    .transform((value) => value || null),
});

/** Admin edits onboarding personal + bank details from the employee profile page. */
export async function updateEmployeePersonalDetails(
  employeeId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let ctx;
  try {
    ctx = await assertCanManageEmployees();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not authorized" };
  }
  const blocked = await assertCanManageTarget(ctx, employeeId);
  if (blocked) return { error: blocked };

  const read = (name: string) => String(formData.get(name) ?? "");
  const sameAddress = formData.get("sameAddress") === "on";
  const parsed = personalDetailsSchema.safeParse({
    joiningDate: read("joiningDate"),
    workLocation: read("workLocation"),
    dateOfBirth: read("dateOfBirth"),
    gender: read("gender"),
    personalEmail: read("personalEmail"),
    currentAddress: read("currentAddress"),
    permanentAddress: sameAddress ? read("currentAddress") : read("permanentAddress"),
    emergencyContactName: read("emergencyContactName"),
    emergencyContactRelation: read("emergencyContactRelation"),
    emergencyContactPhone: read("emergencyContactPhone"),
    panNumber: read("panNumber"),
    aadhaarNumber: read("aadhaarNumber"),
    previousCompany: read("previousCompany"),
    notes: read("notes"),
    bankAccountHolder: read("bankAccountHolder"),
    bankName: read("bankName"),
    bankAccountNumber: read("bankAccountNumber"),
    bankIfsc: read("bankIfsc"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the personal details" };
  }
  const data = parsed.data;
  const supabase = await createClient();

  const { error: employeeError } = await supabase
    .from("employees")
    .update({
      joining_date: data.joiningDate,
      work_location: data.workLocation,
    })
    .eq("id", employeeId);
  if (employeeError) return { error: employeeError.message };

  const { error: onboardingError } = await supabase.from("employee_onboarding").upsert(
    {
      employee_id: employeeId,
      date_of_birth: data.dateOfBirth,
      gender: data.gender,
      personal_email: data.personalEmail,
      current_address: data.currentAddress,
      permanent_address: data.permanentAddress,
      emergency_contact_name: data.emergencyContactName,
      emergency_contact_relation: data.emergencyContactRelation,
      emergency_contact_phone: data.emergencyContactPhone,
      pan_number: data.panNumber,
      aadhaar_number: data.aadhaarNumber,
      previous_company: data.previousCompany,
      notes: data.notes,
      bank_account_holder: data.bankAccountHolder,
      bank_name: data.bankName,
      bank_account_number: data.bankAccountNumber,
      bank_ifsc: data.bankIfsc,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "employee_id" }
  );
  if (onboardingError) return { error: onboardingError.message };

  notifyAdminsOfAction(ctx, "updated the personal details of", { targetEmployeeId: employeeId });
  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath(`/admin/onboarding/${employeeId}`);
  revalidatePath("/admin/onboarding");
  revalidatePath("/admin/employees");
  return { success: true };
}

const superAdminSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter the full name"),
    email: z.email("Enter a valid email"),
    phone: z.string().trim().min(1, "Phone number is required"),
    // Longer than for staff: this account can see and change everything.
    password: z.string().min(8, "Use at least 8 characters for a Super Admin password"),
    confirmPassword: z.string().min(1, "Confirm password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

/**
 * Creates a brand-new Super Admin account: sign-in, employee record and role, no team.
 * Only a Super Admin can do it. Every Super Admin gets a security alert (migration 0045).
 */
export async function createSuperAdmin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isSuperAdmin(ctx.roleKey)) return { error: "Only Super Admin can add a Super Admin." };

  const parsed = superAdminSchema.safeParse({
    fullName: formData.get("fullName"),
    email: String(formData.get("email") ?? "").trim(),
    phone: formData.get("phone"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details" };
  const data = parsed.data;
  // Not asked for in the form: Super Admin is not on payroll or the staff list, so the ID only has to be unique.
  const employeeCode = `SA-${Date.now().toString(36).toUpperCase()}`;

  const supabase = await createClient();
  const service = createServiceClient();
  const { data: role } = await service.from("roles").select("id").eq("role_key", SUPER_ADMIN_ROLE).maybeSingle();
  if (!role) return { error: "The Super Admin role is missing." };

  const { data: authUser, error: authError } = await service.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
    user_metadata: { full_name: data.fullName },
  });
  if (authError || !authUser.user) return { error: authError?.message ?? "Could not create the sign-in account" };

  const { data: employee, error: insertError } = await supabase
    .from("employees")
    .insert({
      employee_code: employeeCode,
      full_name: data.fullName,
      email: data.email,
      phone: data.phone,
      auth_user_id: authUser.user.id,
      employment_status: "ACTIVE",
      joining_date: new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .single();
  if (insertError || !employee) {
    await service.auth.admin.deleteUser(authUser.user.id);
    return {
      error: /duplicate|unique/i.test(insertError?.message ?? "")
        ? "That email is already used by another account."
        : (insertError?.message ?? "Could not create the employee record"),
    };
  }

  const { error: roleError } = await supabase
    .from("employee_roles")
    .insert({ employee_id: employee.id, role_id: role.id, is_primary: true });
  if (roleError) {
    // Leave nothing half-made: no role means the account could not do anything anyway.
    await supabase.from("employees").delete().eq("id", employee.id);
    await service.auth.admin.deleteUser(authUser.user.id);
    return { error: `Could not give the Super Admin role: ${roleError.message}` };
  }

  notifyAdminsOfAction(ctx, "added a new Super Admin:", { targetEmployeeId: employee.id });
  revalidatePath("/admin/employees");
  revalidatePath("/admin/teams");
  revalidatePath("/admin/compliance", "layout");
  return { success: true, employeeId: employee.id };
}

/**
 * Super Admin gives another active person the Super Admin role, so pay, leave and access
 * decisions can always have a second person (control WT-IAM-04). The database alerts every
 * other Super Admin when this happens (migration 0045). To take it away again, put the person
 * into a team from Teams.
 */
export async function makeSuperAdmin(employeeId: string): Promise<ActionState> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isSuperAdmin(ctx.roleKey)) return { error: "Only Super Admin can make someone Super Admin." };
  if (!z.string().uuid().safeParse(employeeId).success) return { error: "Employee not found." };
  if (employeeId === ctx.employeeId) return { error: "You are already Super Admin." };

  const supabase = await createClient();
  const service = createServiceClient();
  const [{ data: employee }, { data: role }] = await Promise.all([
    supabase.from("employees").select("id, employment_status, auth_user_id").eq("id", employeeId).maybeSingle(),
    service.from("roles").select("id").eq("role_key", SUPER_ADMIN_ROLE).maybeSingle(),
  ]);
  if (!employee) return { error: "Employee not found." };
  if (employee.employment_status !== "ACTIVE") {
    return { error: "Only an active employee can be made Super Admin. Restore or unblock them first." };
  }
  if (!employee.auth_user_id) return { error: "This employee has no sign-in account yet." };
  if (!role) return { error: "The Super Admin role is missing." };

  const { data: current } = await supabase
    .from("employee_roles")
    .select("id, role_id")
    .eq("employee_id", employeeId)
    .eq("is_primary", true)
    .maybeSingle();
  if (current?.role_id === role.id) return { error: "This person is already Super Admin." };

  const { error } = current
    ? await supabase.from("employee_roles").update({ role_id: role.id }).eq("id", current.id)
    : await supabase.from("employee_roles").insert({ employee_id: employeeId, role_id: role.id, is_primary: true });
  if (error) return { error: error.message };

  notifyAdminsOfAction(ctx, "made Super Admin:", { targetEmployeeId: employeeId });
  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath("/admin/teams");
  revalidatePath("/admin/compliance", "layout");
  return { success: true };
}

export async function setEmployeeBlocked(employeeId: string, blocked: boolean): Promise<ActionState> {
  return changeEmployeeAccess(employeeId, blocked ? "SUSPENDED" : "ACTIVE", "block");
}

/** Takes someone off every list and stops sign-in. All their records stay, and it can be undone. */
export async function setEmployeeDisabled(employeeId: string, disabled: boolean): Promise<ActionState> {
  return changeEmployeeAccess(employeeId, disabled ? "TERMINATED" : "ACTIVE", "archive");
}

async function changeEmployeeAccess(
  employeeId: string,
  status: "ACTIVE" | "SUSPENDED" | "TERMINATED",
  verb: "block" | "archive"
): Promise<ActionState> {
  let ctx;
  try {
    ctx = await assertCanManageEmployees();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not authorized" };
  }

  if (ctx.employeeId === employeeId) {
    return { error: `You cannot ${verb} your own account.` };
  }

  const targetError = await assertCanManageTarget(ctx, employeeId);
  if (targetError) return { error: targetError };

  if (await employeeIsLastSuperAdmin(employeeId)) {
    return { error: `You cannot ${verb} the last Super Admin.` };
  }

  const blocked = status !== "ACTIVE";

  const supabase = await createClient();
  const { data: employee, error: findError } = await supabase
    .from("employees")
    .select("auth_user_id")
    .eq("id", employeeId)
    .single();

  if (findError || !employee) {
    return { error: findError?.message ?? "Employee not found" };
  }

  const { error: updateError } = await supabase
    .from("employees")
    .update({ employment_status: status })
    .eq("id", employeeId);

  if (updateError) return { error: updateError.message };

  if (blocked) {
    await supabase
      .from("employee_sessions")
      .update({ status: "ENDED", ended_at: new Date().toISOString() })
      .eq("employee_id", employeeId)
      .eq("status", "ACTIVE");
  }

  if (employee.auth_user_id) {
    const service = createServiceClient();
    await service.auth.admin.updateUserById(employee.auth_user_id, {
      ban_duration: blocked ? "876000h" : "none",
    });
  }

  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/attendance");
  revalidatePath("/admin/teams");
  const accessAction =
    status === "TERMINATED" ? "archived" : status === "SUSPENDED" ? "blocked" : verb === "archive" ? "restored" : "unblocked";
  notifyAdminsOfAction(ctx, `${accessAction} the employee`, { targetEmployeeId: employeeId });
  return { success: true };
}

