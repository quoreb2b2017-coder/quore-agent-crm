import { redirect } from "next/navigation";
import { requireCampaigns } from "@/lib/campaigns/access";
import { createServiceClient } from "@/lib/supabase/service";
import { Panel } from "@/components/wt/panel";
import { NewCampaignForm } from "../campaign-forms";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const { access } = await requireCampaigns();
  if (!access.manage) redirect("/admin/campaigns");
  const { data } = await createServiceClient()
    .from("employees")
    .select("id, full_name")
    .eq("employment_status", "ACTIVE")
    .order("full_name");
  return (
    <Panel id="new" title="New campaign" description="The campaign starts as a draft. Add its database team, then mark it ready for its database.">
      <NewCampaignForm people={(data ?? []).map((p) => ({ id: p.id, name: p.full_name }))} />
    </Panel>
  );
}
