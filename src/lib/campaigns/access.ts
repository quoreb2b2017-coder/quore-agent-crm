import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { isSuperAdmin } from "@/lib/permissions/roles";
import type { EmployeeContext } from "@/lib/permissions/types";
import { createServiceClient } from "@/lib/supabase/service";
import type { CampaignMemberRole } from "@/types/supabase";

/**
 * Campaign Operations access, decided on the server for every page, action and download.
 * Three layers: the role's permissions, campaign membership, and (from phase 3) the record assignment.
 * The co_ tables have no grants for signed-in users, so these checks are the only way in.
 */
export type CampaignAccess = {
  view: boolean;
  manage: boolean;
  upload: boolean;
  approve: boolean;
  download: boolean;
  documents: boolean;
  /** Sees every campaign, not only those they are a member of. */
  seeAll: boolean;
};

export function campaignAccess(ctx: EmployeeContext): CampaignAccess {
  const has = (key: string) => ctx.permissions.includes(key);
  const sa = isSuperAdmin(ctx.roleKey);
  const manage = sa || has("co.campaign.manage");
  const approve = sa || has("co.database.approve");
  return {
    view: sa || has("co.campaign.view"),
    manage,
    upload: sa || has("co.database.upload"),
    approve,
    download: sa || has("co.database.download"),
    documents: sa || has("co.documents.manage"),
    seeAll: sa || manage || approve,
  };
}

/** Page guard for every Campaign Operations page. */
export async function requireCampaigns() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) redirect("/login");
  const access = campaignAccess(ctx);
  if (!access.view) redirect("/admin/dashboard");
  return { ctx, access };
}

/** Active campaign roles of one employee, keyed by campaign. Cached per request. */
export const loadMemberships = cache(async (employeeId: string) => {
  const { data } = await createServiceClient()
    .from("co_campaign_members")
    .select("campaign_id, member_role")
    .eq("employee_id", employeeId)
    .is("ended_at", null);
  const map = new Map<string, CampaignMemberRole[]>();
  for (const row of data ?? []) {
    map.set(row.campaign_id, [...(map.get(row.campaign_id) ?? []), row.member_role]);
  }
  return map;
});

/** The roles this person holds on one campaign; null when they may not see it at all. */
export async function campaignRolesFor(ctx: EmployeeContext, campaignId: string): Promise<CampaignMemberRole[] | null> {
  const access = campaignAccess(ctx);
  const roles = (await loadMemberships(ctx.employeeId)).get(campaignId) ?? [];
  if (!access.view) return null;
  if (access.seeAll) return roles;
  return roles.length > 0 ? roles : null;
}

/** Campaign ids a non-manager may see (their memberships). Managers see all: returns null. */
export async function visibleCampaignIds(ctx: EmployeeContext): Promise<string[] | null> {
  const access = campaignAccess(ctx);
  if (access.seeAll) return null;
  return [...(await loadMemberships(ctx.employeeId)).keys()];
}

/** May this person open a published file of this category on this campaign? */
export function canOpenCategory(
  access: CampaignAccess,
  roles: CampaignMemberRole[],
  category: { is_database: boolean; member_roles: string[] }
) {
  if (category.is_database) {
    // Full database files: download permission plus being a database or manager member (or Super Admin-level).
    return access.download && (access.manage || roles.includes("DATABASE") || roles.includes("MANAGER"));
  }
  if (access.manage || access.documents) return true;
  return roles.some((role) => category.member_roles.includes(role));
}

/**
 * May this person upload a database to this campaign? Managers with the upload permission may,
 * and so may anyone added to this campaign as a Database member: the assignment is the permission.
 * Approving and downloading full databases still need their own role permissions.
 */
export function canUploadDatabase(access: CampaignAccess, roles: CampaignMemberRole[]) {
  return (access.upload && access.manage) || roles.includes("DATABASE");
}
