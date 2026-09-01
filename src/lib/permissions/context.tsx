"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { EmployeeContext } from "./types";
import { isAdminLike, staffHasPermission } from "./roles";

const PermissionsContext = createContext<EmployeeContext | null>(null);

export function PermissionsProvider({
  value,
  children,
}: {
  value: EmployeeContext;
  children: ReactNode;
}) {
  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function useEmployeeContext(): EmployeeContext {
  const ctx = useContext(PermissionsContext);
  if (!ctx) {
    throw new Error(
      "useEmployeeContext must be used within a PermissionsProvider"
    );
  }
  return ctx;
}

export function usePermissions() {
  const { permissions, roleKey } = useEmployeeContext();

  return useMemo(
    () => ({
      permissions,
      roleKey,
      has: (permission: string) =>
        staffHasPermission(roleKey, permission) || permissions.includes(permission),
      hasAny: (perms: string[]) =>
        perms.some(
          (permission) =>
            staffHasPermission(roleKey, permission) || permissions.includes(permission)
        ),
      isAdminLike: isAdminLike(roleKey),
    }),
    [permissions, roleKey]
  );
}
