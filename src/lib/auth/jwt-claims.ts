import { isAdminLike } from "@/lib/permissions/roles";

export type WorktrackJwtClaims = {
  employeeId?: string;
  roleKey?: string;
  employmentStatus?: string;
  fullName?: string;
  employeeCode?: string;
  roleDisplayName?: string;
  permissions?: string[];
};

export function hasWorktrackProfileClaims(claims: WorktrackJwtClaims) {
  return Boolean(
    claims.employeeId &&
      claims.roleKey &&
      claims.fullName &&
      claims.employeeCode &&
      claims.roleDisplayName
  );
}

function parseJwtPayload(accessToken: string): Record<string, unknown> | null {
  try {
    const segment = accessToken.split(".")[1];
    if (!segment) return null;
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const json =
      typeof window === "undefined"
        ? Buffer.from(normalized, "base64").toString("utf8")
        : atob(normalized);
    const payload = JSON.parse(json) as Record<string, unknown>;
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

export function readWorktrackJwtClaims(accessToken?: string | null): WorktrackJwtClaims {
  if (!accessToken) return {};
  const payload = parseJwtPayload(accessToken);
  if (!payload) return {};

  const permissions = payload.permissions;
  return {
    employeeId: typeof payload.employee_id === "string" ? payload.employee_id : undefined,
    roleKey: typeof payload.role_key === "string" ? payload.role_key : undefined,
    employmentStatus:
      typeof payload.employment_status === "string" ? payload.employment_status : undefined,
    fullName: typeof payload.full_name === "string" ? payload.full_name : undefined,
    employeeCode: typeof payload.employee_code === "string" ? payload.employee_code : undefined,
    roleDisplayName:
      typeof payload.role_display_name === "string" ? payload.role_display_name : undefined,
    permissions: Array.isArray(permissions)
      ? permissions.filter((value): value is string => typeof value === "string")
      : undefined,
  };
}

export function postLoginPath(roleKey?: string | null) {
  if (!roleKey) return "/";
  return isAdminLike(roleKey) ? "/admin/dashboard" : "/portal/dashboard";
}
