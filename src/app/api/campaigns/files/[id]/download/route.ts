import { NextResponse } from "next/server";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { createServiceClient } from "@/lib/supabase/service";
import { campaignAccess, campaignRolesFor, canOpenCategory } from "@/lib/campaigns/access";

export const runtime = "nodejs";

/** Downloads per person per window, per server instance. Bulk scraping trips this and is logged. */
const LIMIT = 30;
const WINDOW_MS = 10 * 60 * 1000;
const recent = new Map<string, number[]>();

function rateLimited(employeeId: string) {
  const now = Date.now();
  const list = (recent.get(employeeId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= LIMIT) {
    recent.set(employeeId, list);
    return true;
  }
  list.push(now);
  recent.set(employeeId, list);
  return false;
}

/**
 * Authenticated download: checks the person against the file every time, writes an audit event,
 * then redirects to a signed URL that works for 60 seconds. There are no shared or public links.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const service = createServiceClient();
  let campaignId: string | null = null;
  const deny = async (reason: string, status = 403) => {
    await service.rpc("log_security_event", {
      p_employee_id: ctx.employeeId,
      p_action: "CO_DOWNLOAD_DENIED",
      p_details: { file_id: id, reason, ...(campaignId ? { campaign_id: campaignId } : {}) },
    });
    return NextResponse.json({ error: "You don't have access to this file." }, { status });
  };

  if (!/^[0-9a-f-]{36}$/i.test(id)) return deny("bad id", 404);
  const { data: file } = await service
    .from("co_files")
    .select("id, campaign_id, category_key, status, bucket, storage_path, original_name, sha256")
    .eq("id", id)
    .maybeSingle();
  if (!file) return deny("not found", 404);
  campaignId = file.campaign_id;
  // Quarantined, rejected, infected or archived files are never served (prompt §14).
  if (file.status !== "PUBLISHED" || file.bucket !== "co-approved") return deny(`file status ${file.status}`);

  const roles = await campaignRolesFor(ctx, file.campaign_id);
  if (roles === null) return deny("not a campaign member");
  const { data: category } = await service
    .from("co_file_categories")
    .select("is_database, member_roles")
    .eq("key", file.category_key)
    .single();
  if (!category || !canOpenCategory(campaignAccess(ctx), roles, category)) return deny(`category ${file.category_key}`);

  if (rateLimited(ctx.employeeId)) {
    await service.rpc("log_security_event", {
      p_employee_id: ctx.employeeId,
      p_action: "CO_DOWNLOAD_RATE_LIMITED",
      p_details: { file_id: id },
    });
    return NextResponse.json({ error: "Too many downloads in a short time. Wait a few minutes." }, { status: 429 });
  }

  const { data: signed, error } = await service.storage
    .from("co-approved")
    .createSignedUrl(file.storage_path, 60, { download: file.original_name });
  if (error || !signed) return NextResponse.json({ error: "The file store is not available right now." }, { status: 503 });

  await service.rpc("log_security_event", {
    p_employee_id: ctx.employeeId,
    p_action: "CO_FILE_DOWNLOADED",
    p_details: { file_id: id, campaign_id: file.campaign_id, category: file.category_key, sha256: file.sha256 },
  });
  return NextResponse.redirect(signed.signedUrl, 303);
}
