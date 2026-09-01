import { Megaphone, Rocket, CheckCircle2, Mail, UsersRound } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import type { CampaignsDashboardData } from "@/lib/queries/employee-dashboard";

export function MarketingStats({
  data,
  compact = false,
}: {
  data: CampaignsDashboardData;
  compact?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard compact={compact} label="Assigned Campaigns" value={data.assignedCampaigns} icon={Megaphone} tone="info" />
      <StatCard compact={compact} label="Active" value={data.activeCampaigns} icon={Rocket} tone="success" />
      <StatCard compact={compact} label="Completed" value={data.completedCampaigns} icon={CheckCircle2} tone="info" />
      <StatCard compact={compact} label="Emails Processed" value={data.emailsProcessed} icon={Mail} />
      <StatCard compact={compact} label="Leads Owned" value={data.leadsOwned} icon={UsersRound} tone="warning" />
    </div>
  );
}
