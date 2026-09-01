import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { getEmployeeDashboardBundle } from "@/lib/queries/employee-status";
import { getCampaignsDashboardData } from "@/lib/queries/employee-dashboard";
import { StaffDashboard } from "@/components/dashboards/staff-dashboard";
import { greetingForNow, INDIA_TIME_ZONE } from "@/lib/format";

export default async function EmployeeDashboardPage() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return null;

  const { sessionState, commonData } = await getEmployeeDashboardBundle(ctx.employeeId);

  const marketingData =
    ctx.roleKey === "EMAIL_MARKETING" ? await getCampaignsDashboardData(ctx.employeeId) : null;

  const todayLabel = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: INDIA_TIME_ZONE,
  });

  return (
    <StaffDashboard
      compact
      greeting={greetingForNow()}
      firstName={ctx.fullName.split(" ")[0] ?? "there"}
      roleLabel={ctx.roleDisplayName}
      subtitle={todayLabel}
      sessionState={sessionState}
      commonData={commonData}
      marketingData={marketingData}
    />
  );
}
