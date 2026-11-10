import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { EmployeeContext } from "@/lib/permissions/types";
import type { CampaignStatus, DatabaseVersionStatus } from "@/types/supabase";
import { campaignAccess, loadMemberships, visibleCampaignIds } from "./access";
import { ACTIVE_CAMPAIGN_STATUSES } from "./labels";

export type CampaignRow = {
  id: string;
  code: string;
  name: string;
  client_name: string | null;
  status: CampaignStatus;
  starts_on: string | null;
  ends_on: string | null;
  manager_id: string | null;
  updated_at: string;
};

const CAMPAIGN_COLUMNS = "id, code, name, client_name, status, starts_on, ends_on, manager_id, updated_at";

export async function employeeNames(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map<string, string>();
  const { data } = await createServiceClient().from("employees").select("id, full_name").in("id", unique);
  return new Map((data ?? []).map((e) => [e.id, e.full_name]));
}

/** Campaigns this person may see, newest activity first, with optional filters. Paged on the server. */
export async function listCampaigns(
  ctx: EmployeeContext,
  filters: { status?: string; q?: string; page?: number } = {}
) {
  const visible = await visibleCampaignIds(ctx);
  if (visible && visible.length === 0) return { rows: [] as CampaignRow[], total: 0 };
  const pageSize = 50;
  const page = Math.max(1, filters.page ?? 1);
  let query = createServiceClient()
    .from("co_campaigns")
    .select(CAMPAIGN_COLUMNS, { count: "exact" })
    .order("updated_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (visible) query = query.in("id", visible);
  if (filters.status === "ACTIVE") query = query.in("status", ACTIVE_CAMPAIGN_STATUSES);
  else if (filters.status) query = query.eq("status", filters.status as CampaignStatus);
  const q = filters.q?.trim().replace(/[%_,()]/g, " ").trim();
  if (q) query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%,client_name.ilike.%${q}%`);
  const { data, count } = await query;
  return { rows: (data ?? []) as CampaignRow[], total: count ?? 0 };
}

export type VersionRow = {
  id: string;
  campaign_id: string;
  file_id: string;
  version: number;
  status: DatabaseVersionStatus;
  record_count: number;
  valid_count: number;
  invalid_count: number;
  duplicate_count: number;
  uploaded_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  published_at: string | null;
  created_at: string;
  summary: unknown;
};

const VERSION_COLUMNS =
  "id, campaign_id, file_id, version, status, record_count, valid_count, invalid_count, duplicate_count, uploaded_by, decided_by, decided_at, decision_note, published_at, created_at, summary";

export async function listVersions(ctx: EmployeeContext, filters: { status?: string; campaignId?: string } = {}) {
  const visible = await visibleCampaignIds(ctx);
  if (visible && visible.length === 0) return [] as VersionRow[];
  let query = createServiceClient()
    .from("co_database_versions")
    .select(VERSION_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(200);
  if (visible) query = query.in("campaign_id", visible);
  if (filters.campaignId) query = query.eq("campaign_id", filters.campaignId);
  if (filters.status) query = query.eq("status", filters.status as DatabaseVersionStatus);
  const { data } = await query;
  return (data ?? []) as VersionRow[];
}

export async function campaignLookup(ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map<string, { code: string; name: string }>();
  const { data } = await createServiceClient().from("co_campaigns").select("id, code, name").in("id", unique);
  return new Map((data ?? []).map((c) => [c.id, { code: c.code, name: c.name }]));
}

export async function fileLookup(ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map<string, { original_name: string; size_bytes: number; status: string; sha256: string | null; scan_result: string | null }>();
  const { data } = await createServiceClient()
    .from("co_files")
    .select("id, original_name, size_bytes, status, sha256, scan_result")
    .in("id", unique);
  return new Map((data ?? []).map((f) => [f.id, f]));
}

export async function loadCategories() {
  const { data } = await createServiceClient()
    .from("co_file_categories")
    .select("key, label, description, is_database, member_roles, sort_order, retired")
    .order("sort_order");
  return data ?? [];
}

/** Numbers for the Overview page, limited to what this person may see. */
export async function loadOverview(ctx: EmployeeContext) {
  const service = createServiceClient();
  const access = campaignAccess(ctx);
  const visible = await visibleCampaignIds(ctx);
  const scope = <T extends { in: (column: string, values: string[]) => T }>(query: T, column = "campaign_id") =>
    visible ? query.in(column, visible.length ? visible : ["00000000-0000-0000-0000-000000000000"]) : query;

  const soon = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const [campaigns, awaiting, failed, quarantined, blocked, available, ending] = await Promise.all([
    scope(service.from("co_campaigns").select("status"), "id"),
    scope(service.from("co_database_versions").select("id", { count: "exact", head: true }).eq("status", "AWAITING_APPROVAL")),
    scope(service.from("co_database_versions").select("id", { count: "exact", head: true }).eq("status", "VALIDATION_FAILED")),
    scope(service.from("co_files").select("id", { count: "exact", head: true }).in("status", ["QUARANTINED", "SCANNING", "PUBLISHING"])),
    scope(service.from("co_files").select("id", { count: "exact", head: true }).eq("status", "INFECTED")),
    scope(service.from("co_lead_records").select("id", { count: "exact", head: true }).eq("status", "AVAILABLE")),
    scope(
      service
        .from("co_campaigns")
        .select(CAMPAIGN_COLUMNS)
        .in("status", ACTIVE_CAMPAIGN_STATUSES)
        .gte("ends_on", today)
        .lte("ends_on", soon)
        .order("ends_on"),
      "id"
    ),
  ]);

  const byStatus = new Map<string, number>();
  for (const row of (campaigns.data ?? []) as { status: string }[]) byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1);
  const active = ACTIVE_CAMPAIGN_STATUSES.reduce((sum, s) => sum + (byStatus.get(s) ?? 0), 0);

  // Versions this person can decide on: waiting, and not their own upload.
  let myApprovals: VersionRow[] = [];
  if (access.approve) {
    const { data } = await scope(
      service.from("co_database_versions").select(VERSION_COLUMNS).eq("status", "AWAITING_APPROVAL").order("created_at")
    );
    myApprovals = ((data ?? []) as VersionRow[]).filter((v) => v.uploaded_by !== ctx.employeeId);
  }
  const { data: myUploads } = await service
    .from("co_database_versions")
    .select(VERSION_COLUMNS)
    .eq("uploaded_by", ctx.employeeId)
    .in("status", ["VALIDATION_FAILED", "REJECTED", "BLOCKED", "PENDING_SCAN", "VALIDATING", "AWAITING_APPROVAL"])
    .order("created_at", { ascending: false })
    .limit(10);

  return {
    byStatus,
    active,
    awaitingApproval: awaiting.count ?? 0,
    failedValidation: failed.count ?? 0,
    inQuarantine: quarantined.count ?? 0,
    blocked: blocked.count ?? 0,
    availableRecords: available.count ?? 0,
    endingSoon: (ending.data ?? []) as CampaignRow[],
    myApprovals,
    myUploads: (myUploads ?? []) as VersionRow[],
    memberships: (await loadMemberships(ctx.employeeId)).size,
  };
}
