import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCampaigns } from "@/lib/campaigns/access";
import { campaignLookup, employeeNames, fileLookup, listVersions } from "@/lib/campaigns/queries";
import { VERSION_STATUS, formatBytes, formatCount } from "@/lib/campaigns/labels";
import { shortDate } from "@/lib/compliance/labels";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import { Panel, Pill } from "@/components/wt/panel";
import { Button } from "@/components/ui/button";
import type { DatabaseVersionStatus } from "@/types/supabase";

export const dynamic = "force-dynamic";

/** Every database version across the campaigns this person may see (replaces the Quore_Database share). */
export default async function DatabaseRepositoryPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { ctx, access } = await requireCampaigns();
  if (!access.upload && !access.approve && !access.download) redirect("/admin/campaigns");
  const { status } = await searchParams;
  const validStatus = status && status in VERSION_STATUS ? status : undefined;
  const versions = await listVersions(ctx, { status: validStatus });
  const [campaigns, files, names] = await Promise.all([
    campaignLookup(versions.map((v) => v.campaign_id)),
    fileLookup(versions.map((v) => v.file_id)),
    employeeNames(versions.flatMap((v) => [v.uploaded_by, v.decided_by])),
  ]);

  return (
    <Panel
      id="repository"
      title={`Database repository · ${versions.length}`}
      description="Uploads stay in quarantine until they are scanned and validated. They become usable only after someone other than the uploader approves them."
      actions={
        <form className="flex items-center gap-2">
          <select name="status" defaultValue={validStatus ?? ""} aria-label="Status" className={`${NATIVE_SELECT_CLASS} h-9 w-52`}>
            <option value="">All statuses</option>
            {(Object.keys(VERSION_STATUS) as DatabaseVersionStatus[]).map((s) => (
              <option key={s} value={s}>{VERSION_STATUS[s].label}</option>
            ))}
          </select>
          <Button type="submit" variant="outline" className="h-9">Filter</Button>
        </form>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-5 py-2.5 font-medium">Campaign</th>
              <th scope="col" className="px-3 py-2.5 font-medium">File</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Rows</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Uploaded</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Decided</th>
              <th scope="col" className="px-5 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {versions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                  {validStatus ? "No database version has this status." : "No databases uploaded yet. Upload one from a campaign's Database tab."}
                </td>
              </tr>
            ) : (
              versions.map((v) => {
                const campaign = campaigns.get(v.campaign_id);
                const file = files.get(v.file_id);
                return (
                  <tr key={v.id} className="align-top hover:bg-muted/30">
                    <td className="px-5 py-3">
                      <Link href={`/admin/campaigns/${v.campaign_id}?tab=database`} className="font-medium hover:underline">{campaign?.name ?? "Campaign"}</Link>
                      <span className="block font-mono text-xs text-muted-foreground">{campaign?.code} · v{v.version}</span>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <span className="block max-w-[14rem] truncate" title={file?.original_name}>{file?.original_name ?? "—"}</span>
                      <span className="text-muted-foreground">{file ? formatBytes(Number(file.size_bytes)) : ""}{file?.sha256 ? ` · ${file.sha256.slice(0, 10)}…` : ""}</span>
                    </td>
                    <td className="px-3 py-3 text-xs tabular-nums">
                      {v.record_count ? `${formatCount(v.valid_count)} / ${formatCount(v.record_count)} valid` : "—"}
                      {v.invalid_count + v.duplicate_count ? (
                        <span className="block text-muted-foreground">{formatCount(v.invalid_count)} invalid · {formatCount(v.duplicate_count)} dup.</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-xs">{shortDate(v.created_at)}<span className="block text-muted-foreground">{names.get(v.uploaded_by ?? "") ?? "—"}</span></td>
                    <td className="px-3 py-3 text-xs">{v.decided_by ? <>{shortDate(v.decided_at)}<span className="block text-muted-foreground">{names.get(v.decided_by)}</span></> : "—"}</td>
                    <td className="px-5 py-3">
                      <Pill tone={VERSION_STATUS[v.status].tone}>{VERSION_STATUS[v.status].label}</Pill>
                      {v.status === "AWAITING_APPROVAL" && access.approve && v.uploaded_by !== ctx.employeeId ? (
                        <Link href={`/admin/campaigns/${v.campaign_id}?tab=database`} className="mt-1 block text-xs text-primary hover:underline">Review</Link>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
