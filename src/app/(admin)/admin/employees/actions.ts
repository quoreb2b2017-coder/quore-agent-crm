"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentEmployeeContext, hasPermission } from "@/lib/permissions/server";
import { SUPER_ADMIN_ROLE, STAFF_ROLE_KEYS, type StaffRoleKey } from "@/lib/permissions/roles";

const staffDepartment = z.enum(STAFF_ROLE_KEYS);

const createSchema = z
  .object({
    fullName: z.string().min(1, "Full name is required"),
    email: z.email("Enter a valid email"),
    phone: z.string().min(1, "Phone number is required"),
    employeeCode: z.string().min(1, "Employee ID is required"),
    password: z.string().min(4, "Password must be at least 4 characters"),
    confirmPassword: z.string().min(1, "Confirm password"),
    department: staffDepartment,
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
    department: staffDepartment.optional(),
    password: z.string().optional(),
    confirmPassword: z.string().optional(),
  })
  .refine(
    (data) => !data.password || data.password.length >= 4,
    { message: "Password must be at least 4 characters", path: ["password"] }
  )
  .refine(
    (data) => !data.password || data.password === data.confirmPassword,
    { message: "Passwords do not match", path: ["confirmPassword"] }
  );

export type ActionState = { error?: string; success?: boolean };

async function assertCanManageEmployees() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !hasPermission(ctx, "employees.manage")) {
    throw new Error("You do not have permission to manage employees.");
  }
  return ctx;
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

async function roleIdForDepartment(department: StaffRoleKey) {
  const supabase = await createClient();
  const { data: role, error } = await supabase
    .from("roles")
    .select("id")
    .eq("role_key", department)
    .maybeSingle();

  if (error || !role) {
    throw new Error(
      "That department is missing. Run scripts/sync-staff-roles.sql in Supabase."
    );
  }
  return role.id;
}

export async function createEmployee(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await assertCanManageEmployees();
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
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const data = parsed.data;
  const supabase = await createClient();
  const service = createServiceClient();

  let roleId: string;
  try {
    roleId = await roleIdForDepartment(data.department);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Department not found" };
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

  revalidatePath("/admin/employees");
  return { success: true };
}

export async function updateEmployee(
  employeeId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await assertCanManageEmployees();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not authorized" };
  }

  const password = String(formData.get("password") ?? "");
  const departmentValue = String(formData.get("department") ?? "").trim();
  const parsed = updateSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    employeeCode: String(formData.get("employeeCode") ?? "").trim(),
    department: departmentValue || undefined,
    password: password || undefined,
    confirmPassword: formData.get("confirmPassword") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const data = parsed.data;
  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("employees")
    .select("auth_user_id")
    .eq("id", employeeId)
    .single();

  if (existingError || !existing) {
    return { error: existingError?.message ?? "Employee not found" };
  }

  const { error: updateError } = await supabase
    .from("employees")
    .update({
      employee_code: data.employeeCode,
      full_name: data.fullName,
      email: data.email,
      phone: data.phone,
    })
    .eq("id", employeeId);

  if (updateError) {
    return { error: updateError.message };
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

    if (currentRoleKey !== SUPER_ADMIN_ROLE) {
      let roleId: string;
      try {
        roleId = await roleIdForDepartment(data.department);
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Department not found" };
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

  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${employeeId}`);
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
