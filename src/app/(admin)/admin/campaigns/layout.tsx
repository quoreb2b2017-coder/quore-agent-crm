import Link from "next/link";
import { Plus } from "lucide-react";
import { requireCampaigns, visibleCampaignIds } from "@/lib/campaigns/access";
import { createServiceClient } from "@/lib/supabase/service";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { CampaignTabs } from "./campaign-tabs";

export default async function CampaignsLayout({ children }: { children: React.ReactNode }) {
  const { ctx, access } = await requireCampaigns();

  let awaiting = 0;
  if (access.approve) {
    const visible = await visibleCampaignIds(ctx);
    let query = createServiceClient()
      .from("co_database_versions")
      .select("id", { count: "exact", head: true })
      .eq("status", "AWAITING_APPROVAL")
      .neq("uploaded_by", ctx.employeeId);
    if (visible) query = query.in("campaign_id", visible.length ? visible : ["00000000-0000-0000-0000-000000000000"]);
    awaiting = (await query).count ?? 0;
  }

  const showRepository = access.upload || access.approve || access.download;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Replaces the Windows Server shares"
        title="Campaign Operations"
        description="Every database is scanned for malware, validated row by row and approved by a second person before anyone else can use it."
        actions={
          access.manage ? (
            <Button asChild>
              <Link href="/admin/campaigns/new">
                <Plus className="size-4" /> New campaign
              </Link>
            </Button>
          ) : undefined
        }
      />
      <CampaignTabs
        tabs={[
          { href: "/admin/campaigns", label: "Overview" },
          { href: "/admin/campaigns/all", label: "All campaigns" },
          ...(showRepository ? [{ href: "/admin/campaigns/repository", label: "Database repository", badge: awaiting }] : []),
          { href: "/admin/campaigns/documents", label: "Document repository" },
        ]}
      />
      {children}
    </div>
  );
}
