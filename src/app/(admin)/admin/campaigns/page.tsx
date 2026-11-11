import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireCampaigns } from "@/lib/campaigns/access";
import { campaignLookup, employeeNames, loadOverview } from "@/lib/campaigns/queries";
import { CAMPAIGN_STATUS, CAMPAIGN_STATUS_ORDER, VERSION_STATUS, formatCount } from "@/lib/campaigns/labels";
import { shortDate } from "@/lib/compliance/labels";
import { KpiStrip, Panel, Pill, SegmentBar } from "@/components/wt/panel";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "#d0d5dd",
  AWAITING_DATABASE: "#f5a35c",
  DATABASE_VALIDATION: "#7fb8e8",
  AWAITING_APPROVAL: "#fdb022",
  READY_FOR_DISTRIBUTION: "#00d9a6",
  IN_PRODUCTION: "#17b26a",
  QC_IN_PROGRESS: "#2e90fa",
  ON_HOLD: "#98a2b3",
  COMPLETED: "#067647",
  ARCHIVED: "#eaecf0",
};

export default async function CampaignOverviewPage() {
  const { ctx, access } = await requireCampaigns();
  const data = await loadOverview(ctx);
  const campaigns = await campaignLookup([...data.myApprovals, ...data.myUploads].map((v) => v.campaign_id));
  const names = await employeeNames(data.myApprovals.map((v) => v.uploaded_by));

  const noScope = !access.seeAll && data.memberships === 0;

  return (
    <div className="flex flex-col gap-5">
      {noScope ? (
        <Panel>
          <p className="px-5 py-6 text-sm text-muted-foreground">
            You are not a member of any campaign yet. A campaign manager adds you when there is work for you.
          </p>
        </Panel>
      ) : null}

      <KpiStrip
        items={[
          { label: "Active campaigns", value: formatCount(data.active), href: "/admin/campaigns/all?status=ACTIVE" },
          {
            label: "Databases awaiting approval",
            value: formatCount(data.awaitingApproval),
            sub: data.myApprovals.length ? `${data.myApprovals.length} for you` : undefined,
            subTone: "warning",
            href: "/admin/campaigns/repository?status=AWAITING_APPROVAL",
          },
          { label: "Failed validation", value: formatCount(data.failedValidation), subTone: "danger", href: "/admin/campaigns/repository?status=VALIDATION_FAILED" },
          { label: "Files being checked", value: formatCount(data.inQuarantine), sub: "scan, validate or publish" },
          {
            label: "Blocked as malware",
            value: formatCount(data.blocked),
            sub: data.blocked ? "never opened by anyone" : undefined,
            subTone: data.blocked ? "danger" : "neutral",
          },
          { label: "Records available", value: formatCount(data.availableRecords), sub: "approved, not yet allocated" },
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Panel
          id="decide"
          title="Waiting for your decision"
          description="Databases validated and waiting for a second person. You never see your own uploads here."
        >
          {data.myApprovals.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              {access.approve ? "Nothing is waiting for you." : "Database approvals are made by people with approval rights."}
            </p>
          ) : (
            <ul className="divide-y">
              {data.myApprovals.map((v) => (
                <li key={v.id}>
                  <Link href={`/admin/campaigns/${v.campaign_id}?tab=database`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {campaigns.get(v.campaign_id)?.code} · {campaigns.get(v.campaign_id)?.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Version {v.version} by {names.get(v.uploaded_by ?? "") ?? "unknown"} · {formatCount(v.valid_count)} valid of {formatCount(v.record_count)}
                      </p>
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel id="status" title="Campaigns by status">
          <div className="px-5 py-4">
            <SegmentBar
              label="Campaigns by status"
              segments={CAMPAIGN_STATUS_ORDER.map((s) => ({ label: CAMPAIGN_STATUS[s].label, count: data.byStatus.get(s) ?? 0, color: STATUS_COLOR[s] }))}
            />
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel id="mine" title="Your recent uploads" description="Databases you uploaded that are still moving through the checks, or need your attention.">
          {data.myUploads.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              {access.upload ? "No uploads in progress." : "You don't upload databases."}
            </p>
          ) : (
            <ul className="divide-y">
              {data.myUploads.map((v) => (
                <li key={v.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/campaigns/${v.campaign_id}?tab=database`} className="truncate text-sm font-medium hover:underline">
                      {campaigns.get(v.campaign_id)?.code} · version {v.version}
                    </Link>
                    {v.decision_note && v.status === "REJECTED" ? (
                      <p className="text-xs text-muted-foreground">Reason: {v.decision_note}</p>
                    ) : null}
                  </div>
                  <Pill tone={VERSION_STATUS[v.status].tone}>{VERSION_STATUS[v.status].label}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel id="deadlines" title="Ending in the next 14 days">
          {data.endingSoon.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">No active campaign ends in the next two weeks.</p>
          ) : (
            <ul className="divide-y">
              {data.endingSoon.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/campaigns/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.code} · {c.name}</p>
                      <p className="text-xs text-muted-foreground">Ends {shortDate(c.ends_on)}</p>
                    </div>
                    <Pill tone={CAMPAIGN_STATUS[c.status].tone}>{CAMPAIGN_STATUS[c.status].label}</Pill>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
