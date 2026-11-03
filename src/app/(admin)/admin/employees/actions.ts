"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentEmployeeContext, hasPermission } from "@/lib/permissions/server";
import {
  HR_ROLE,
  isHr,
  isManagement,
  isSuperAdmin,
  SUPER_ADMIN_ROLE,
  STAFF_ROLE_KEYS,
} from "@/lib/permissions/roles";
import {
  isDepartmentKind,
  roleAllowedForKind,
  type AssignableRoleKey,
  type DepartmentKind,
} from "@/lib/departments";
import { isSuperAdminEmployee } from "@/lib/queries/admin-dashboard";
import {
  parseWorkSchedule,
  timeValueToMinutes,
  workSchedulePayload,
  type WorkSchedule,
} from "@/lib/work-settings";
import { validateWorkSchedule } from "@/lib/work-settings-server";
import type { Json } from "@/types/supabase";

const assignableRole = z.enum([...STAFF_ROLE_KEYS, HR_ROLE] as [AssignableRoleKey, ...AssignableRoleKey[]]);
const departmentKindSchema = z.enum(["SALES", "MANAGEMENT", "HR"]);

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

const updateSchema = z
  .object({
    fullName: z.string().min(1, "Full name is required"),
    email: z.email("Enter a valid email"),
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
  .superRefine((data, ctx) => {
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
  });

function scheduleFromUpdate(data: z.infer<typeof updateSchema>): WorkSchedule | null {
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
});

const renameDepartmentSchema = z.object({
  departmentId: z.string().uuid(),
  name: z
    .string()
    .trim()
    .min(2, "Department name is too short")
    .max(80, "Department name is too long"),
});

/** Create an org department with a role-group kind. */
export async function createDepartment(
  _prev: DepartmentActionState,
  formData: FormData
): Promise<DepartmentActionState> {
  try {
    await assertCanManageEmployees();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not authorized" };
  }

  const parsed = createDepartmentSchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid department" };
  }

  const name = parsed.data.name.replace(/\s+/g, " ");
  const supabase = await createClient();
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
  revalidatePath("/admin/onboarding");
  return {
    success: true,
    departmentId: data.id,
    name: data.name,
    kind: parsed.data.kind,
  };
}

/** Rename a department (display name only — kind / roles stay the same). */
export async function renameDepartment(
  _prev: DepartmentActionState,
  formData: FormData
): Promise<DepartmentActionState> {
  try {
    await assertCanManageEmployees();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not authorized" };
  }

  const parsed = renameDepartmentSchema.safeParse({
    departmentId: formData.get("departmentId"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid department name" };
  }

  const name = parsed.data.name.replace(/\s+/g, " ");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("departments")
    .update({ name, updated_at: new Date().toISOString() })
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
  revalidatePath("/admin/onboarding");
  return {
    success: true,
    departmentId: data.id,
    name: data.name,
    kind: data.kind && isDepartmentKind(data.kind) ? data.kind : undefined,
  };
}

async function roleIdForKey(roleKey: AssignableRoleKey) {
  const supabase = await createClient();
  const { data: role, error } = await supabase
    .from("roles")
    .select("id")
    .eq("role_key", roleKey)
    .maybeSingle();

  if (error || !role) {
    throw new Error(
      "That role is missing. Run scripts/sync-staff-roles.sql in Supabase."
    );
  }
  return role.id;
}

async function departmentKindForId(departmentId: string): Promise<DepartmentKind | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("departments")
    .select("kind, name")
    .eq("id", departmentId)
    .maybeSingle();
  if (!data) return null;
  if (data.kind && isDepartmentKind(data.kind)) return data.kind;
  const name = data.name.trim().toLowerCase();
  if (name.includes("sale") || name.includes("agent")) return "SALES";
  if (name.includes("hr")) return "HR";
  if (name.includes("manage") || name.includes("database") || name.includes("email")) {
    return "MANAGEMENT";
  }
  return null;
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
  const kind =
    departmentRow.kind && isDepartmentKind(departmentRow.kind)
      ? departmentRow.kind
      : await departmentKindForId(data.departmentId);
  if (!kind || !roleAllowedForKind(kind, data.department)) {
    return { error: "That role does not belong to the selected department" };
  }

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

  if (data.dateOfBirth) {
    const { error: birthdayError } = await supabase
      .from("employee_onboarding")
      .upsert({ employee_id: employeeId, date_of_birth: data.dateOfBirth }, { onConflict: "employee_id" });
    if (birthdayError) return { error: `Profile saved, but birthday failed: ${birthdayError.message}` };
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
        const kind = await departmentKindForId(data.departmentId);
        if (!kind || !roleAllowedForKind(kind, data.department)) {
          return { error: "That role does not belong to the selected department" };
        }
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

  // Shift change must refresh the employee's portal clock (login/logout window).
  revalidatePath("/", "layout");
  revalidatePath("/portal", "layout");
  revalidatePath("/portal/dashboard");
  revalidatePath("/portal/attendance");
  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath(`/admin/onboarding/${employeeId}`);
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/attendance");

  try {
    const { loadEffectiveWorkSettings } = await import("@/lib/work-settings-server");
    const { addDaysIso, todayIso } = await import("@/lib/format");
    const { recomputeShiftTotals } = await import("@/lib/actions/attendance");
    await loadEffectiveWorkSettings(employeeId);
    const { createServiceClient } = await import("@/lib/supabase/service");
    const service = createServiceClient();
    const since = addDaysIso(todayIso(), -14);
    const { data: days } = await service
      .from("attendance")
      .select("attendance_date, overtime_minutes, status")
      .eq("employee_id", employeeId)
      .gte("attendance_date", since)
      .lte("attendance_date", todayIso());
    for (const day of days ?? []) {
      if (day.status === "ON_LEAVE" || day.status === "HOLIDAY" || day.status === "WEEK_OFF") continue;
      await recomputeShiftTotals(employeeId, day.attendance_date, day.overtime_minutes ?? 0);
    }
  } catch {
    /* shift is saved; totals catch up on next clock-out */
  }

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

  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath(`/admin/onboarding/${employeeId}`);
  revalidatePath("/admin/onboarding");
  revalidatePath("/admin/employees");
  return { success: true };
}

export async function setEmployeeBlocked(
  employeeId: string,
  blocked: boolean
): Promise<ActionState> {
  let ctx;
  try {
    ctx = await assertCanManageEmployees();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not authorized" };
  }

  if (ctx.employeeId === employeeId) {
    return { error: "You cannot block your own account." };
  }

  const targetError = await assertCanManageTarget(ctx, employeeId);
  if (targetError) return { error: targetError };

  if (await employeeIsLastSuperAdmin(employeeId)) {
    return { error: "You cannot block the last Super Admin." };
  }

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
    .update({ employment_status: blocked ? "SUSPENDED" : "ACTIVE" })
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
  return { success: true };
}

export async function deleteEmployee(employeeId: string): Promise<ActionState> {
  let ctx;
  try {
    ctx = await assertCanManageEmployees();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not authorized" };
  }

  if (!isSuperAdmin(ctx.roleKey)) {
    return { error: "Only Super Admin can delete employees." };
  }

  if (ctx.employeeId === employeeId) {
    return { error: "You cannot delete your own account." };
  }

  if (await employeeIsLastSuperAdmin(employeeId)) {
    return { error: "You cannot delete the last Super Admin." };
  }

  const supabase = await createClient();
  const { data: employee, error: findError } = await supabase
    .from("employees")
    .select("auth_user_id")
    .eq("id", employeeId)
    .single();

  if (findError || !employee) {
    return { error: findError?.message ?? "Employee not found" };
  }

  const { error: deleteError } = await supabase.from("employees").delete().eq("id", employeeId);
  if (deleteError) return { error: deleteError.message };

  if (employee.auth_user_id) {
    const service = createServiceClient();
    await service.auth.admin.deleteUser(employee.auth_user_id);
  }

  revalidatePath("/admin/employees");
  return { success: true };
}
