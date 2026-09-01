"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";

export type ActionState = { error?: string; success?: boolean };

async function assertSuperAdmin() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || ctx.roleKey !== "SUPER_ADMIN") {
    throw new Error("Only Super Admin can manage roles and permissions.");
  }
}

const roleSchema = z.object({
  roleKey: z
    .string()
    .min(2)
    .regex(/^[A-Z][A-Z0-9_]*$/, "Use UPPER_SNAKE_CASE, e.g. CUSTOMER_SUPPORT"),
  displayName: z.string().min(1, "Display name is required"),
  description: z.string().optional(),
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
    roleKey: formData.get("roleKey"),
    displayName: formData.get("displayName"),
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("roles").insert({
    role_key: parsed.data.roleKey,
    display_name: parsed.data.displayName,
    description: parsed.data.description || null,
    is_system: false,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/roles");
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

  revalidatePath("/admin/roles");
  return { success: true };
}
