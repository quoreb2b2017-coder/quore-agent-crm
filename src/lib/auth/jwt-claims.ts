import { isAdminLike } from "@/lib/permissions/roles";

export type WorktrackJwtClaims = {
  employeeId?: string;
  roleKey?: string;
  employmentStatus?: string;
  fullName?: string;
  employeeCode?: string;
  roleDisplayName?: string;
  permissions?: string[];
  exp?: number;
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
    exp: typeof payload.exp === "number" ? payload.exp : undefined,
  };
}

export function isAccessTokenExpiringSoon(accessToken: string | null | undefined, skewSeconds = 300) {
  if (!accessToken) return true;
  const payload = parseJwtPayload(accessToken);
  const exp = typeof payload?.exp === "number" ? payload.exp : null;
  if (exp == null) return true;
  return exp * 1000 <= Date.now() + skewSeconds * 1000;
}

function decodeSessionCookieValue(raw: string): string | null {
  try {
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch {
      value = raw;
    }

    if (value.startsWith("base64-")) {
      const json =
        typeof window === "undefined"
          ? Buffer.from(value.slice(7), "base64").toString("utf8")
          : atob(value.slice(7));
      const parsed = JSON.parse(json) as { access_token?: string };
      return parsed.access_token ?? null;
    }

    if (value.startsWith("{")) {
      const parsed = JSON.parse(value) as { access_token?: string };
      return parsed.access_token ?? null;
    }

    if (value.includes(".") && value.split(".").length >= 3) {
      return value;
    }
  } catch {
    return null;
  }
  return null;
}

/** Read Supabase access token from request cookies without a network call. */
export function accessTokenFromCookieList(
  cookies: Array<{ name: string; value: string }>
): string | null {
  const authCookies = cookies.filter(
    (cookie) => cookie.name.includes("auth-token") && !cookie.name.includes("code-verifier")
  );
  if (authCookies.length === 0) return null;

  const chunked = authCookies
    .map((cookie) => {
      const match = cookie.name.match(/\.(\d+)$/);
      return match ? { index: Number(match[1]), value: cookie.value } : null;
    })
    .filter((row): row is { index: number; value: string } => row != null)
    .sort((a, b) => a.index - b.index);

  if (chunked.length > 0) {
    return decodeSessionCookieValue(chunked.map((row) => row.value).join(""));
  }

  const primary =
    authCookies.find((cookie) => cookie.name.endsWith("-auth-token")) ?? authCookies[0];
  return primary ? decodeSessionCookieValue(primary.value) : null;
}

export function hasAuthCookie(cookies: Array<{ name: string; value: string }>) {
  return cookies.some(
    (cookie) => cookie.name.includes("auth-token") && !cookie.name.includes("code-verifier")
  );
}

export function postLoginPath(roleKey?: string | null) {
  // No role in JWT yet → home page loads context from DB (do not loop in middleware).
  if (!roleKey) return "/";
  return isAdminLike(roleKey) ? "/admin/dashboard" : "/portal/dashboard";
}
