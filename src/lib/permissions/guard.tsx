"use client";

import type { ReactNode } from "react";
import { usePermissions } from "./context";

/**
 * Client-side conditional rendering only — this is a UX convenience, not a
 * security boundary. Real enforcement happens via Supabase RLS and
 * server-side permission checks (see src/lib/permissions/server.ts).
 */
export function RequirePermission({
  permission,
  fallback = null,
  children,
}: {
  permission: string | string[];
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { has, hasAny } = usePermissions();
  const allowed = Array.isArray(permission) ? hasAny(permission) : has(permission);
  return allowed ? <>{children}</> : <>{fallback}</>;
}
