import "server-only";
import { companyProfile } from "@/lib/company";
import { enforceMfa } from "@/lib/auth/mfa";
import { countApprovals } from "@/lib/queries/approvals";
import { isManagement, isSuperAdmin } from "@/lib/permissions/roles";
import type { EmployeeContext } from "@/lib/permissions/types";
import type { PaletteAction } from "@/components/layout/command-palette";

export async function loadShell(ctx: EmployeeContext, brand: "admin" | "employee") {
  const [{ mfaEnabled, mfaRequired }, approvals] = await Promise.all([
    enforceMfa(ctx.roleKey),
    brand === "admin" && isManagement(ctx.roleKey) ? countApprovals(ctx) : Promise.resolve(null),
  ]);
  const paletteActions: PaletteAction[] = [];
  if (approvals) {
    paletteActions.push({ label: `Review ${approvals} pending approval${approvals === 1 ? "" : "s"}`, hint: "Approvals", href: "/admin/approvals", icon: "inbox" });
  }
  // TEMP: two-factor paused — don't nag in the command palette.
  // const base = brand === "admin" ? "/admin" : "/portal";
  // if (!mfaEnabled) {
  //   paletteActions.push({ label: "Turn on two-factor sign-in", hint: "Account security", href: `${base}/security`, icon: "fingerprint" });
  // }
  if (isSuperAdmin(ctx.roleKey)) {
    paletteActions.push(
      { label: "Open the control register", hint: "Compliance", href: "/admin/compliance/controls", icon: "shield" },
      { label: "Verify the audit log", hint: "Audit log", href: "/admin/audit-logs", icon: "scroll" }
    );
  }
  if (isManagement(ctx.roleKey)) {
    paletteActions.push({ label: "Add an employee", hint: "Employees", href: "/admin/employees", icon: "users" });
  }
  paletteActions.push({ label: "Apply for leave", hint: "Leave", href: brand === "admin" ? "/admin/leave" : "/portal/leave", icon: "calendar" });

  return {
    companyName: companyProfile().legalName,
    approvalsCount: approvals,
    mfaEnabled,
    mfaRequired,
    paletteActions,
  };
}
