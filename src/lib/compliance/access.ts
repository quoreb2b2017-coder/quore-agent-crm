import "server-only";
import { redirect } from "next/navigation";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { isSuperAdmin } from "@/lib/permissions/roles";
import type { EmployeeContext } from "@/lib/permissions/types";

export function complianceAccess(ctx: EmployeeContext) {
  const manage = isSuperAdmin(ctx.roleKey) || ctx.permissions.includes("compliance.manage");
  const view = manage || ctx.permissions.includes("compliance.view") || ctx.permissions.includes("compliance.audit");
  return { view, manage };
}

/** Page guard: compliance pages need compliance.view, compliance.audit or Super Admin. */
export async function requireCompliance() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) redirect("/login");
  const access = complianceAccess(ctx);
  if (!access.view) redirect("/admin/dashboard");
  return { ctx, ...access };
}

/** Action guard: returns the context only when the caller can change compliance records. */
export async function complianceManager() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return null;
  return complianceAccess(ctx).manage ? ctx : null;
}
