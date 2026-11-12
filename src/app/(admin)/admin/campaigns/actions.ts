"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { createDataClient } from "@/lib/supabase/data";
import { createServiceClient } from "@/lib/supabase/service";
import {
  campaignAccess,
  campaignRolesFor,
  canUploadDatabase,
} from "@/lib/campaigns/access";
import {
  DATABASE_EXTENSIONS,
  DOCUMENT_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  REQUIRED_FIELD_OPTIONS,
} from "@/lib/campaigns/labels";
import { insertAndEmitNotification, notifyAdminsOfAction } from "@/lib/realtime/notify";
import type { CampaignMemberRole, CampaignStatus } from "@/types/supabase";

export type ActionResult = { error?: string; success?: boolean; id?: string };

const MEMBER_ROLES: CampaignMemberRole[] = ["MANAGER", "DATABASE", "PRODUCTION", "CALLER", "QA"];

function text(formData: FormData, key: string, max = 2000) {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value.slice(0, max) : null;
}

function list(formData: FormData, key: string) {
  return String(formData.get(key) ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((item) => item.slice(0, 120));
}

function dbError(message: string) {
  // Database rules raise plain sentences; anything else is replaced so internals never reach the screen.
  if (/^(A |An |Only |The |Database |This )/.test(message)) return message;
  if (/duplicate key/.test(message)) return "That already exists.";
  return "The change could not be saved. Try again, or tell your administrator.";
}

function refresh(campaignId?: string) {
  revalidatePath("/admin/campaigns", "layout");
  if (campaignId) revalidatePath(`/admin/campaigns/${campaignId}`);
}

async function actor() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return null;
  return { ctx, access: campaignAccess(ctx) };
}

// ------------------------------------------------------------ campaigns

function campaignFields(formData: FormData) {
  const required = formData
    .getAll("required_fields")
    .map(String)
    .filter((key) => REQUIRED_FIELD_OPTIONS.some((option) => option.key === key));
  return {
    name: text(formData, "name", 160) ?? "",
    client_name: text(formData, "client_name", 160),
    advertiser: text(formData, "advertiser", 160),
    description: text(formData, "description", 4000),
    instructions: text(formData, "instructions", 8000),
    geography: list(formData, "geography"),
    industries: list(formData, "industries"),
    job_titles: list(formData, "job_titles"),
    starts_on: text(formData, "starts_on", 10),
    ends_on: text(formData, "ends_on", 10),
    manager_id: text(formData, "manager_id", 40),
    required_fields: required,
  };
}

async function checkManager(managerId: string | null) {
  if (!managerId) return null;
  const { data } = await createServiceClient()
    .from("employees")
    .select("id, employment_status")
    .eq("id", managerId)
    .maybeSingle();
  if (!data || data.employment_status !== "ACTIVE") return "Pick an active employee as campaign manager.";
  return null;
}

export async function createCampaign(formData: FormData): Promise<ActionResult> {
  const me = await actor();
  if (!me?.access.manage) return { error: "You don't have permission to create campaigns." };
  const fields = campaignFields(formData);
  if (fields.name.length < 2) return { error: "Give the campaign a name." };
  const managerProblem = await checkManager(fields.manager_id);
  if (managerProblem) return { error: managerProblem };

  const supabase = await createDataClient();
  const { data, error } = await supabase
    .from("co_campaigns")
    .insert({ ...fields, created_by: me.ctx.employeeId })
    .select("id, code, name")
    .single();
  if (error || !data) return { error: dbError(error?.message ?? "") };

  if (fields.manager_id) {
    await supabase.from("co_campaign_members").insert({
      campaign_id: data.id,
      employee_id: fields.manager_id,
      member_role: "MANAGER",
      added_by: me.ctx.employeeId,
    });
  }
  notifyAdminsOfAction(me.ctx, `created campaign ${data.code}`, { detail: data.name });
  refresh(data.id);
  return { success: true, id: data.id };
}

export async function updateCampaign(formData: FormData): Promise<ActionResult> {
  const me = await actor();
  if (!me?.access.manage) return { error: "You don't have permission to edit campaigns." };
  const id = text(formData, "id", 40);
  if (!id) return { error: "Campaign not found." };
  const fields = campaignFields(formData);
  if (fields.name.length < 2) return { error: "Give the campaign a name." };
  const managerProblem = await checkManager(fields.manager_id);
  if (managerProblem) return { error: managerProblem };

  const supabase = await createDataClient();
  const { data: current } = await supabase.from("co_campaigns").select("status, manager_id").eq("id", id).maybeSingle();
  if (!current) return { error: "Campaign not found." };
  if (current.status === "ARCHIVED") return { error: "An archived campaign cannot be edited." };

  const { error } = await supabase.from("co_campaigns").update(fields).eq("id", id);
  if (error) return { error: dbError(error.message) };

  if (fields.manager_id && fields.manager_id !== current.manager_id) {
    const { data: existing } = await supabase
      .from("co_campaign_members")
      .select("id")
      .eq("campaign_id", id)
      .eq("employee_id", fields.manager_id)
      .eq("member_role", "MANAGER")
      .is("ended_at", null)
      .maybeSingle();
    if (!existing) {
      await supabase.from("co_campaign_members").insert({
        campaign_id: id,
        employee_id: fields.manager_id,
        member_role: "MANAGER",
        added_by: me.ctx.employeeId,
      });
    }
  }
  refresh(id);
  return { success: true, id };
}

const STATUS_ACTIONS = {
  submit: { from: ["DRAFT"], label: "ready for its database" },
  hold: { from: ["DRAFT", "AWAITING_DATABASE", "DATABASE_VALIDATION", "AWAITING_APPROVAL", "READY_FOR_DISTRIBUTION", "IN_PRODUCTION", "QC_IN_PROGRESS"], label: "on hold" },
  resume: { from: ["ON_HOLD"], label: "resumed" },
  archive: { from: ["DRAFT", "AWAITING_DATABASE", "DATABASE_VALIDATION", "AWAITING_APPROVAL", "READY_FOR_DISTRIBUTION", "COMPLETED", "ON_HOLD"], label: "archived" },
} as const;

export async function changeCampaignStatus(
  campaignId: string,
  action: keyof typeof STATUS_ACTIONS,
  reason: string
): Promise<ActionResult> {
  const me = await actor();
  if (!me?.access.manage) return { error: "You don't have permission to change campaign status." };
  const rule = STATUS_ACTIONS[action];
  if (!rule) return { error: "Unknown action." };
  if ((action === "hold" || action === "archive") && reason.trim().length < 3) {
    return { error: "Give a short reason; it goes into the audit log." };
  }

  const supabase = await createDataClient();
  const { data: campaign } = await supabase
    .from("co_campaigns")
    .select("id, code, name, status, held_from")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return { error: "Campaign not found." };
  if (!(rule.from as readonly string[]).includes(campaign.status)) {
    return { error: `A campaign that is ${campaign.status.replaceAll("_", " ").toLowerCase()} cannot be ${rule.label}.` };
  }

  let target: CampaignStatus;
  if (action === "submit") target = "AWAITING_DATABASE";
  else if (action === "hold") target = "ON_HOLD";
  else if (action === "resume") target = (campaign.held_from as CampaignStatus | null) ?? "DRAFT";
  else target = "ARCHIVED";

  if (action === "archive") {
    const { count } = await supabase
      .from("co_database_versions")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .in("status", ["PENDING_SCAN", "VALIDATING", "APPROVED"]);
    if (count) return { error: "A database is still being processed. Wait until it finishes, then archive." };
  }

  const { error } = await supabase.from("co_campaigns").update({ status: target }).eq("id", campaignId);
  if (error) return { error: dbError(error.message) };

  if (reason.trim()) {
    await createServiceClient().rpc("log_security_event", {
      p_employee_id: me.ctx.employeeId,
      p_action: `CO_CAMPAIGN_${action.toUpperCase()}`,
      p_details: { campaign_id: campaignId, code: campaign.code, from: campaign.status, to: target, reason: reason.slice(0, 500) },
    });
  }
  refresh(campaignId);
  return { success: true };
}

/**
 * Deletes a campaign made by mistake. The database allows it only while the campaign is Draft or
 * Awaiting database and has no file, database version or lead row (0051); anything else is archived.
 */
export async function deleteEmptyCampaign(campaignId: string, reason: string): Promise<ActionResult> {
  const me = await actor();
  if (!me?.access.manage) return { error: "You don't have permission to delete campaigns." };
  if (reason.trim().length < 3) return { error: "Give a short reason; it goes into the audit log." };

  const supabase = await createDataClient();
  const { data: campaign } = await supabase
    .from("co_campaigns")
    .select("id, code, name, status")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return { error: "Campaign not found." };

  const { error } = await supabase.rpc("co_delete_empty_campaign", { p_campaign_id: campaignId });
  if (error) {
    return {
      error: /function .*co_delete_empty_campaign/i.test(error.message)
        ? "Deleting campaigns is not set up yet. Run supabase/migrations/0051_campaign_members_and_empty_delete.sql."
        : dbError(error.message),
    };
  }

  await createServiceClient().rpc("log_security_event", {
    p_employee_id: me.ctx.employeeId,
    p_action: "CO_CAMPAIGN_DELETE",
    p_details: { campaign_id: campaignId, code: campaign.code, name: campaign.name, reason: reason.slice(0, 500) },
  });
  notifyAdminsOfAction(me.ctx, `deleted the empty campaign ${campaign.code} (${campaign.name})`);
  refresh();
  return { success: true };
}

// ------------------------------------------------------------ members

export async function addCampaignMember(formData: FormData): Promise<ActionResult> {
  const me = await actor();
  if (!me?.access.manage) return { error: "You don't have permission to change campaign members." };
  const campaignId = text(formData, "campaign_id", 40);
  const employeeId = text(formData, "employee_id", 40);
  const role = String(formData.get("member_role") ?? "") as CampaignMemberRole;
  if (!campaignId || !employeeId || !MEMBER_ROLES.includes(role)) return { error: "Pick a person and a campaign role." };

  const service = createServiceClient();
  const [{ data: campaign }, { data: person }] = await Promise.all([
    service.from("co_campaigns").select("status").eq("id", campaignId).maybeSingle(),
    service.from("employees").select("id, full_name, employment_status").eq("id", employeeId).maybeSingle(),
  ]);
  if (!campaign) return { error: "Campaign not found." };
  if (campaign.status === "ARCHIVED") return { error: "An archived campaign cannot change members." };
  if (!person || person.employment_status !== "ACTIVE") return { error: "Only active employees can join a campaign." };

  if (role === "DATABASE") {
    const { data: perms } = await service.rpc("get_employee_permissions", { p_employee_id: employeeId });
    if (!(perms ?? []).includes("co.database.upload")) {
      return { error: `${person.full_name}'s role cannot upload databases. Give them the Database role first.` };
    }
  }

  const supabase = await createDataClient();
  const { error } = await supabase.from("co_campaign_members").insert({
    campaign_id: campaignId,
    employee_id: employeeId,
    member_role: role,
    added_by: me.ctx.employeeId,
  });
  if (error) return { error: /duplicate/.test(error.message) ? `${person.full_name} already has that role on this campaign.` : dbError(error.message) };

  await insertAndEmitNotification({
    employeeId,
    type: "CAMPAIGN_ASSIGNMENT",
    title: "Added to a campaign",
    body: `You were added to a campaign as ${role.toLowerCase()}. Open Campaign Operations to see it.`,
    data: { href: `/admin/campaigns/${campaignId}` },
  });
  refresh(campaignId);
  return { success: true };
}

export async function endCampaignMember(memberId: string): Promise<ActionResult> {
  const me = await actor();
  if (!me?.access.manage) return { error: "You don't have permission to change campaign members." };
  const supabase = await createDataClient();
  const { data, error } = await supabase
    .from("co_campaign_members")
    .update({ ended_at: new Date().toISOString(), ended_by: me.ctx.employeeId })
    .eq("id", memberId)
    .is("ended_at", null)
    .select("campaign_id")
    .maybeSingle();
  if (error) return { error: dbError(error.message) };
  if (!data) return { error: "That membership has already ended." };
  refresh(data.campaign_id);
  return { success: true };
}

// ------------------------------------------------------------ uploads

type UploadRequest = {
  campaignId: string;
  categoryKey: string;
  title: string;
  fileName: string;
  size: number;
  mimeType: string;
};

/**
 * Step 1 of an upload: checks the person, the campaign and the file, records the file as UPLOADING
 * and returns a one-time signed URL into the private quarantine bucket. The browser sends the file
 * straight there, so large databases never pass through Vercel.
 */
export async function requestUpload(input: UploadRequest): Promise<ActionResult & { fileId?: string; path?: string; token?: string }> {
  const me = await actor();
  if (!me) return { error: "Sign in again." };
  const roles = await campaignRolesFor(me.ctx, input.campaignId);
  if (roles === null) return { error: "You don't have access to this campaign." };

  const service = createServiceClient();
  const [{ data: campaign }, { data: category }] = await Promise.all([
    service.from("co_campaigns").select("id, status").eq("id", input.campaignId).maybeSingle(),
    service.from("co_file_categories").select("key, is_database, retired").eq("key", input.categoryKey).maybeSingle(),
  ]);
  if (!campaign) return { error: "Campaign not found." };
  if (campaign.status === "ARCHIVED" || campaign.status === "ON_HOLD") {
    return { error: "This campaign is not taking uploads while it is archived or on hold." };
  }
  if (!category || category.retired) return { error: "Pick a file category." };

  if (category.is_database) {
    if (!canUploadDatabase(me.access, roles)) return { error: "Only database members of this campaign can upload its database." };
  } else if (!me.access.documents && !me.access.manage && !roles.includes("MANAGER")) {
    return { error: "You don't have permission to upload campaign documents." };
  }

  const fileName = input.fileName.trim().slice(0, 200);
  const extension = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  const allowed: readonly string[] = category.is_database ? DATABASE_EXTENSIONS : DOCUMENT_EXTENSIONS;
  if (!allowed.includes(extension)) {
    return { error: category.is_database ? "Databases must be .csv or .xlsx (not .xlsm)." : `Allowed types: ${DOCUMENT_EXTENSIONS.join(", ")}.` };
  }
  if (!Number.isFinite(input.size) || input.size <= 0) return { error: "The file is empty." };
  if (input.size > MAX_UPLOAD_BYTES) return { error: "Files can be up to 100 MB. Split larger databases into parts." };

  const title = (input.title.trim() || fileName).slice(0, 200);
  const { data: previous } = await service
    .from("co_files")
    .select("id, version")
    .eq("campaign_id", input.campaignId)
    .eq("category_key", input.categoryKey)
    .eq("title", title)
    .order("version", { ascending: false })
    .limit(1);
  const version = (previous?.[0]?.version ?? 0) + 1;

  const path = `${input.campaignId}/${input.categoryKey.toLowerCase()}/${randomUUID()}.${extension}`;
  const supabase = await createDataClient();
  const { data: file, error } = await supabase
    .from("co_files")
    .insert({
      campaign_id: input.campaignId,
      category_key: input.categoryKey,
      title,
      original_name: fileName,
      extension,
      size_bytes: Math.round(input.size),
      mime_type: input.mimeType?.slice(0, 120) || null,
      storage_path: path,
      version,
      supersedes_id: previous?.[0]?.id ?? null,
      uploaded_by: me.ctx.employeeId,
    })
    .select("id")
    .single();
  if (error || !file) return { error: dbError(error?.message ?? "") };

  const { data: signed, error: signError } = await service.storage.from("co-quarantine").createSignedUploadUrl(path);
  if (signError || !signed) return { error: "Upload storage is not available. Ask your administrator to check the co-quarantine bucket." };
  return { success: true, fileId: file.id, path, token: signed.token };
}

/** Step 2: the browser finished sending the file. Hands it to the scanner, and opens a database version. */
export async function completeUpload(fileId: string): Promise<ActionResult> {
  const me = await actor();
  if (!me) return { error: "Sign in again." };
  const service = createServiceClient();
  const { data: file } = await service
    .from("co_files")
    .select("id, campaign_id, category_key, storage_path, status, uploaded_by, original_name")
    .eq("id", fileId)
    .maybeSingle();
  if (!file || file.uploaded_by !== me.ctx.employeeId) return { error: "Upload not found." };
  if (file.status !== "UPLOADING") return { success: true };

  const folder = file.storage_path.split("/").slice(0, -1).join("/");
  const name = file.storage_path.split("/").pop()!;
  const { data: objects } = await service.storage.from("co-quarantine").list(folder, { search: name, limit: 1 });
  if (!objects?.some((o) => o.name === name)) return { error: "The file did not arrive. Try the upload again." };

  const supabase = await createDataClient();
  const { data: category } = await service.from("co_file_categories").select("is_database").eq("key", file.category_key).single();
  if (category?.is_database) {
    const { data: last } = await service
      .from("co_database_versions")
      .select("version")
      .eq("campaign_id", file.campaign_id)
      .order("version", { ascending: false })
      .limit(1);
    const { error: versionError } = await supabase.from("co_database_versions").insert({
      campaign_id: file.campaign_id,
      file_id: file.id,
      version: (last?.[0]?.version ?? 0) + 1,
      uploaded_by: me.ctx.employeeId,
    });
    if (versionError) return { error: dbError(versionError.message) };
  }

  const { error } = await supabase.from("co_files").update({ status: "QUARANTINED" }).eq("id", file.id).eq("status", "UPLOADING");
  if (error) return { error: dbError(error.message) };
  refresh(file.campaign_id);
  return { success: true };
}

// ------------------------------------------------------------ approval

export async function decideDatabaseVersion(versionId: string, decision: "approve" | "reject", note: string): Promise<ActionResult> {
  const me = await actor();
  if (!me?.access.approve) return { error: "You don't have permission to approve databases." };
  const service = createServiceClient();
  const { data: version } = await service
    .from("co_database_versions")
    .select("id, campaign_id, file_id, version, status, uploaded_by, valid_count")
    .eq("id", versionId)
    .maybeSingle();
  if (!version) return { error: "Database version not found." };
  if (version.uploaded_by === me.ctx.employeeId) return { error: "You uploaded this database, so someone else must decide on it." };
  if (version.status !== "AWAITING_APPROVAL") return { error: "This version is no longer waiting for approval." };
  if (decision === "reject" && note.trim().length < 3) return { error: "Say why it is rejected; the uploader sees this." };

  const supabase = await createDataClient();
  const { error } = await supabase
    .from("co_database_versions")
    .update({
      status: decision === "approve" ? "APPROVED" : "REJECTED",
      decided_by: me.ctx.employeeId,
      decided_at: new Date().toISOString(),
      decision_note: note.trim().slice(0, 1000) || null,
    })
    .eq("id", versionId)
    .eq("status", "AWAITING_APPROVAL");
  if (error) return { error: dbError(error.message) };

  await supabase
    .from("co_files")
    .update({ status: decision === "approve" ? "PUBLISHING" : "REJECTED" })
    .eq("id", version.file_id);

  const { data: campaign } = await service.from("co_campaigns").select("code, name").eq("id", version.campaign_id).maybeSingle();
  if (version.uploaded_by) {
    await insertAndEmitNotification({
      employeeId: version.uploaded_by,
      type: "CAMPAIGN_FILE",
      title: decision === "approve" ? `Database approved: ${campaign?.code ?? ""}` : `Database rejected: ${campaign?.code ?? ""}`,
      body:
        decision === "approve"
          ? `Version ${version.version} was approved by ${me.ctx.fullName}. It is being published now.`
          : `Version ${version.version} was rejected by ${me.ctx.fullName}: ${note.trim().slice(0, 300)}`,
      data: { href: `/admin/campaigns/${version.campaign_id}?tab=database` },
    });
  }
  refresh(version.campaign_id);
  return { success: true };
}

// ------------------------------------------------------------ archive a file

export async function archiveCampaignFile(fileId: string, reason: string): Promise<ActionResult> {
  const me = await actor();
  if (!me) return { error: "Sign in again." };
  if (reason.trim().length < 3) return { error: "Give a short reason; it goes into the audit log." };
  const service = createServiceClient();
  const { data: file } = await service
    .from("co_files")
    .select("id, campaign_id, category_key, status, uploaded_by")
    .eq("id", fileId)
    .maybeSingle();
  if (!file) return { error: "File not found." };
  const isOwnUnfinished = file.uploaded_by === me.ctx.employeeId && ["UPLOADING", "SCAN_FAILED", "REJECTED"].includes(file.status);
  if (!me.access.manage && !me.access.documents && !isOwnUnfinished) return { error: "You don't have permission to archive this file." };

  const { data: version } = await service
    .from("co_database_versions")
    .select("status")
    .eq("file_id", fileId)
    .maybeSingle();
  if (version && ["PUBLISHED", "APPROVED", "AWAITING_APPROVAL", "VALIDATING", "PENDING_SCAN"].includes(version.status)) {
    return { error: "This database version is live or still in progress. Upload a new version to replace it instead." };
  }
  if (["SCANNING", "PUBLISHING"].includes(file.status)) return { error: "Wait for the scanner to finish with this file." };

  const supabase = await createDataClient();
  const { error } = await supabase
    .from("co_files")
    .update({ status: "ARCHIVED", archived_by: me.ctx.employeeId })
    .eq("id", fileId);
  if (error) return { error: dbError(error.message) };
  await service.rpc("log_security_event", {
    p_employee_id: me.ctx.employeeId,
    p_action: "CO_FILE_ARCHIVED",
    p_details: { file_id: fileId, campaign_id: file.campaign_id, reason: reason.slice(0, 500) },
  });
  refresh(file.campaign_id);
  return { success: true };
}
