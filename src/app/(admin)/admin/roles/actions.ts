"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { isDepartmentKind } from "@/lib/departments";
import { notifyAdminsOfAction } from "@/lib/realtime/notify";

export type ActionState = { error?: string; success?: boolean };

async function assertSuperAdmin() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || ctx.roleKey !== "SUPER_ADMIN") {
    throw new Error("Only Super Admin can manage roles and permissions.");
  }
}

async function notifyRoleChange(action: string) {
  const ctx = await getCurrentEmployeeContext();
  if (ctx) notifyAdminsOfAction(ctx, action);
}

const departmentKindSchema = z.enum([
  "ADMIN_CONTROL",
  "SALES",
  "MARKETING",
  "DATABASE",
  "IT",
]);

const roleSchema = z.object({
  roleKey: z
    .string()
    .min(2)
    .regex(/^[A-Z][A-Z0-9_]*$/, "Use UPPER_SNAKE_CASE, e.g. CUSTOMER_SUPPORT"),
  displayName: z.string().min(1, "Display name is required"),
  description: z.string().optional(),
  departmentKind: departmentKindSchema,
});

export async function createRole(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await assertSuperAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not authorized" };
  }

  const parsed = roleSchema.safeParse({
    roleKey: String(formData.get("roleKey") ?? "")
      .trim()
      .toUpperCase(),
    displayName: formData.get("displayName"),
    description: formData.get("description") || undefined,
    departmentKind: formData.get("departmentKind"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("roles").insert({
    role_key: parsed.data.roleKey,
    display_name: parsed.data.displayName,
    description: parsed.data.description || null,
    department_kind: parsed.data.departmentKind,
    is_system: false,
  });

  if (error) {
    if (/column.*department_kind/i.test(error.message)) {
      return {
        error: "Run supabase/migrations/0033_role_department_kind.sql in Supabase first.",
      };
    }
    if (/duplicate|unique/i.test(error.message)) {
      return { error: "That role key already exists" };
    }
    return { error: error.message };
  }

  await notifyRoleChange(`created the role ${parsed.data.displayName}`);
  revalidatePath("/admin/roles");
  revalidatePath("/admin/employees");
  return { success: true };
}

const updateRoleSchema = z.object({
  roleId: z.string().uuid(),
  displayName: z.string().min(1, "Display name is required"),
  description: z.string().optional(),
  roleKey: z
    .string()
    .min(2)
    .regex(/^[A-Z][A-Z0-9_]*$/, "Use UPPER_SNAKE_CASE")
    .optional(),
  departmentKind: departmentKindSchema.optional(),
});

/** Rename / describe a role. System roles keep a fixed role_key. */
export async function updateRole(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await assertSuperAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not authorized" };
  }

  const rawKey = String(formData.get("roleKey") ?? "").trim().toUpperCase();
  const kindRaw = String(formData.get("departmentKind") ?? "").trim();
  const parsed = updateRoleSchema.safeParse({
    roleId: formData.get("roleId"),
    displayName: formData.get("displayName"),
    description: formData.get("description") || undefined,
    roleKey: rawKey || undefined,
    departmentKind: kindRaw || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { data: existing, error: loadError } = await supabase
    .from("roles")
    .select("id, role_key, is_system")
    .eq("id", parsed.data.roleId)
    .maybeSingle();
  if (loadError || !existing) {
    return { error: loadError?.message ?? "Role not found" };
  }

  const payload: {
    display_name: string;
    description: string | null;
    role_key?: string;
    department_kind?: string;
    updated_at: string;
  } = {
    display_name: parsed.data.displayName.trim(),
    description: parsed.data.description?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (!existing.is_system && parsed.data.roleKey && parsed.data.roleKey !== existing.role_key) {
    payload.role_key = parsed.data.roleKey;
  }
  if (parsed.data.departmentKind && isDepartmentKind(parsed.data.departmentKind)) {
    payload.department_kind = parsed.data.departmentKind;
  }

  const { error } = await supabase.from("roles").update(payload).eq("id", existing.id);
  if (error) {
    if (/column.*department_kind/i.test(error.message)) {
      return {
        error: "Run supabase/migrations/0033_role_department_kind.sql in Supabase first.",
      };
    }
    if (/duplicate|unique/i.test(error.message)) {
      return { error: "That role key already exists" };
    }
    return { error: error.message };
  }

  await notifyRoleChange(`updated the role ${payload.display_name}`);
  revalidatePath("/admin/roles");
  revalidatePath("/admin/employees");
  return { success: true };
}

const deleteRoleSchema = z.object({
  roleId: z.string().uuid(),
});

/** Delete a custom role that nobody is assigned to. */
export async function deleteRole(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await assertSuperAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not authorized" };
  }

  const parsed = deleteRoleSchema.safeParse({
    roleId: formData.get("roleId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Pick a role" };
  }

  const supabase = await createClient();
  const { data: existing, error: loadError } = await supabase
    .from("roles")
    .select("id, role_key, is_system")
    .eq("id", parsed.data.roleId)
    .maybeSingle();
  if (loadError || !existing) {
    return { error: loadError?.message ?? "Role not found" };
  }
  if (existing.is_system) {
    return { error: "System roles cannot be deleted" };
  }

  const { count } = await supabase
    .from("employee_roles")
    .select("id", { count: "exact", head: true })
    .eq("role_id", existing.id);
  if ((count ?? 0) > 0) {
    return { error: "Move everyone off this role before deleting it" };
  }

  await supabase.from("role_permissions").delete().eq("role_id", existing.id);
  const { error } = await supabase.from("roles").delete().eq("id", existing.id);
  if (error) return { error: error.message };

  await notifyRoleChange(`deleted the role ${existing.role_key}`);
  revalidatePath("/admin/roles");
  revalidatePath("/admin/employees");
  return { success: true };
}

export async function setRolePermissions(
  roleId: string,
  permissionIds: string[]
): Promise<ActionState> {
  try {
    await assertSuperAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not authorized" };
  }

  const supabase = await createClient();

  const { data: role } = await supabase.from("roles").select("role_key").eq("id", roleId).maybeSingle();
  if (!role) return { error: "Role not found." };
  if (role.role_key === "SUPER_ADMIN") {
    return { error: "Super Admin permissions are fixed and cannot be changed here." };
  }

  const { error: deleteError } = await supabase
    .from("role_permissions")
    .delete()
    .eq("role_id", roleId);

  if (deleteError) return { error: deleteError.message };

  if (permissionIds.length > 0) {
    const { error: insertError } = await supabase.from("role_permissions").insert(
      permissionIds.map((permissionId) => ({
        role_id: roleId,
        permission_id: permissionId,
      }))
    );
    if (insertError) return { error: insertError.message };
  }

  await notifyRoleChange(`changed the permissions of the role ${role.role_key}`);
  revalidatePath("/admin/roles");
  return { success: true };
}
