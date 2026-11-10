import Link from "next/link";
import { requireCampaigns } from "@/lib/campaigns/access";
import { employeeNames, listCampaigns } from "@/lib/campaigns/queries";
import { CAMPAIGN_STATUS, CAMPAIGN_STATUS_ORDER } from "@/lib/campaigns/labels";
import { shortDate } from "@/lib/compliance/labels";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import { Panel, Pill } from "@/components/wt/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const dynamic = "force-dynamic";

export default async function AllCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const { ctx, access } = await requireCampaigns();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const { rows, total } = await listCampaigns(ctx, { status: params.status, q: params.q, page });
  const names = await employeeNames(rows.map((r) => r.manager_id));
  const pages = Math.max(1, Math.ceil(total / 50));
  const link = (p: number) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.q) qs.set("q", params.q);
    qs.set("page", String(p));
    return `/admin/campaigns/all?${qs.toString()}`;
  };

  return (
    <Panel
      id="campaigns"
      title={`Campaigns · ${total.toLocaleString("en-US")}`}
      description={access.seeAll ? "Every campaign." : "Campaigns you are a member of."}
      actions={
        <form className="flex flex-wrap items-center gap-2" role="search">
          <Input name="q" defaultValue={params.q ?? ""} placeholder="Name, code or client" aria-label="Search campaigns" className="h-9 w-56" />
          <select name="status" defaultValue={params.status ?? ""} aria-label="Status" className={`${NATIVE_SELECT_CLASS} h-9 w-52`}>
            <option value="">All statuses</option>
            <option value="ACTIVE">Active (not completed or archived)</option>
            {CAMPAIGN_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{CAMPAIGN_STATUS[s].label}</option>
            ))}
          </select>
          <Button type="submit" variant="outline" className="h-9">Filter</Button>
        </form>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-5 py-2.5 font-medium">Campaign</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Client</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Manager</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Dates</th>
              <th scope="col" className="px-5 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">
                  {params.q || params.status ? "No campaign matches these filters." : access.manage ? (
                    <>No campaigns yet. <Link href="/admin/campaigns/new" className="text-primary hover:underline">Create the first one</Link>.</>
                  ) : "No campaigns yet."}
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-5 py-3">
                    <Link href={`/admin/campaigns/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                    <span className="block font-mono text-xs text-muted-foreground">{c.code}</span>
                  </td>
                  <td className="px-3 py-3">{c.client_name ?? "—"}</td>
                  <td className="px-3 py-3">{c.manager_id ? names.get(c.manager_id) ?? "—" : "—"}</td>
                  <td className="px-3 py-3 text-xs">{c.starts_on || c.ends_on ? `${shortDate(c.starts_on)} – ${shortDate(c.ends_on)}` : "—"}</td>
                  <td className="px-5 py-3"><Pill tone={CAMPAIGN_STATUS[c.status].tone}>{CAMPAIGN_STATUS[c.status].label}</Pill></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-between border-t px-5 py-3 text-sm">
          <span className="text-muted-foreground">Page {page} of {pages}</span>
          <span className="flex gap-2">
            {page > 1 ? <Button asChild variant="outline" size="sm"><Link href={link(page - 1)}>Previous</Link></Button> : null}
            {page < pages ? <Button asChild variant="outline" size="sm"><Link href={link(page + 1)}>Next</Link></Button> : null}
          </span>
        </nav>
      ) : null}
    </Panel>
  );
}
