import { NextResponse } from "next/server";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { createServiceClient } from "@/lib/supabase/service";
import { campaignAccess, campaignRolesFor } from "@/lib/campaigns/access";
import { csvCell } from "@/lib/campaigns/labels";

export const runtime = "nodejs";

const PAGE = 1000;
const MAX_ROWS = 200_000;

/**
 * The rows of one database version that failed validation or were duplicates, with the reasons,
 * so the database team can fix the source file. Approvers and the campaign's database members only.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const service = createServiceClient();
  const { data: version } = await service
    .from("co_database_versions")
    .select("id, campaign_id, version")
    .eq("id", id)
    .maybeSingle();
  if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = campaignAccess(ctx);
  const roles = await campaignRolesFor(ctx, version.campaign_id);
  const allowed = roles !== null && (access.approve || access.manage || (access.upload && roles.includes("DATABASE")));
  if (!allowed) {
    await service.rpc("log_security_event", {
      p_employee_id: ctx.employeeId,
      p_action: "CO_DOWNLOAD_DENIED",
      p_details: { version_id: id, what: "invalid rows" },
    });
    return NextResponse.json({ error: "You don't have access to this report." }, { status: 403 });
  }

  const header = ["Row", "Status", "Reasons", "Name", "Email", "Phone", "Company", "Job title", "Country"];
  const lines = [header.map(csvCell).join(",")];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await service
      .from("co_lead_records")
      .select("row_number, status, invalid_reasons, full_name, email, phone, company, job_title, country")
      .eq("version_id", id)
      .in("status", ["INVALID", "DUPLICATE"])
      .order("row_number")
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: "The report could not be built." }, { status: 500 });
    for (const r of data ?? []) {
      lines.push(
        [r.row_number, r.status, r.invalid_reasons.join("; "), r.full_name, r.email, r.phone, r.company, r.job_title, r.country]
          .map(csvCell)
          .join(",")
      );
    }
    if (!data || data.length < PAGE) break;
  }

  await service.rpc("log_security_event", {
    p_employee_id: ctx.employeeId,
    p_action: "CO_INVALID_ROWS_EXPORTED",
    p_details: { version_id: id, campaign_id: version.campaign_id, rows: lines.length - 1 },
  });

  return new NextResponse(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="invalid-rows-v${version.version}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
