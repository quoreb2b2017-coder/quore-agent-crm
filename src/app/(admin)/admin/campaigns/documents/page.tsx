import Link from "next/link";
import { Download } from "lucide-react";
import { campaignAccess, canOpenCategory, loadMemberships, requireCampaigns, visibleCampaignIds } from "@/lib/campaigns/access";
import { campaignLookup, employeeNames, loadCategories } from "@/lib/campaigns/queries";
import { FILE_STATUS, formatBytes } from "@/lib/campaigns/labels";
import { shortDate } from "@/lib/compliance/labels";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import { createServiceClient } from "@/lib/supabase/service";
import { Panel, Pill } from "@/components/wt/panel";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/** Campaign documents across campaigns, filtered to what this person's campaign roles may open. */
export default async function DocumentRepositoryPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { ctx } = await requireCampaigns();
  const access = campaignAccess(ctx);
  const { category: categoryFilter } = await searchParams;
  const categories = (await loadCategories()).filter((c) => !c.is_database);
  const categoryByKey = new Map(categories.map((c) => [c.key, c]));
  const visible = await visibleCampaignIds(ctx);
  const memberships = await loadMemberships(ctx.employeeId);

  let rows: {
    id: string;
    campaign_id: string;
    category_key: string;
    title: string;
    original_name: string;
    size_bytes: number;
    version: number;
    status: keyof typeof FILE_STATUS;
    uploaded_by: string | null;
    created_at: string;
  }[] = [];
  if (!visible || visible.length) {
    let query = createServiceClient()
      .from("co_files")
      .select("id, campaign_id, category_key, title, original_name, size_bytes, version, status, uploaded_by, created_at")
      .in("category_key", categories.map((c) => c.key))
      .neq("status", "ARCHIVED")
      .neq("status", "UPLOADING")
      .order("created_at", { ascending: false })
      .limit(300);
    if (visible) query = query.in("campaign_id", visible);
    if (categoryFilter && categoryByKey.has(categoryFilter)) query = query.eq("category_key", categoryFilter);
    rows = (await query).data ?? [];
  }
  // Members see only the categories their campaign role allows; managers see all.
  rows = rows.filter((f) => {
    const category = categoryByKey.get(f.category_key);
    return category && canOpenCategory(access, memberships.get(f.campaign_id) ?? [], category);
  });

  const [campaigns, names] = await Promise.all([
    campaignLookup(rows.map((r) => r.campaign_id)),
    employeeNames(rows.map((r) => r.uploaded_by)),
  ]);

  return (
    <Panel
      id="documents"
      title={`Document repository · ${rows.length}`}
      description="Scripts, SOPs, instructions and reports for your campaigns. Upload new ones from the campaign's Documents tab."
      actions={
        <form className="flex items-center gap-2">
          <select name="category" defaultValue={categoryFilter ?? ""} aria-label="Type" className={`${NATIVE_SELECT_CLASS} h-9 w-56`}>
            <option value="">All types</option>
            {categories.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <Button type="submit" variant="outline" className="h-9">Filter</Button>
        </form>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-5 py-2.5 font-medium">Document</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Campaign</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Type</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Uploaded</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
              <th scope="col" className="px-5 py-2.5 font-medium"><span className="sr-only">Download</span></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">No documents you can open yet.</td></tr>
            ) : (
              rows.map((f) => (
                <tr key={f.id} className="align-top hover:bg-muted/30">
                  <td className="px-5 py-3">
                    <p className="font-medium">{f.title}{f.version > 1 ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">v{f.version}</span> : null}</p>
                    <p className="max-w-[16rem] truncate text-xs text-muted-foreground">{f.original_name} · {formatBytes(Number(f.size_bytes))}</p>
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <Link href={`/admin/campaigns/${f.campaign_id}?tab=documents`} className="hover:underline">{campaigns.get(f.campaign_id)?.code}</Link>
                    <span className="block max-w-[12rem] truncate text-muted-foreground">{campaigns.get(f.campaign_id)?.name}</span>
                  </td>
                  <td className="px-3 py-3 text-xs">{categoryByKey.get(f.category_key)?.label}</td>
                  <td className="px-3 py-3 text-xs">{shortDate(f.created_at)}<span className="block text-muted-foreground">{names.get(f.uploaded_by ?? "") ?? "—"}</span></td>
                  <td className="px-3 py-3"><Pill tone={FILE_STATUS[f.status].tone}>{FILE_STATUS[f.status].label}</Pill></td>
                  <td className="px-5 py-3 text-right">
                    {f.status === "PUBLISHED" ? (
                      <Button asChild variant="ghost" size="sm" title="Download">
                        <a href={`/api/campaigns/files/${f.id}/download`}><Download className="size-4" /><span className="sr-only">Download</span></a>
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
