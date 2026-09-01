import { ClockWidget } from "@/components/attendance/clock-widget";
import { CommonStats } from "@/components/dashboards/common-stats";
import { MarketingStats } from "@/components/dashboards/marketing-stats";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { DashboardPanel } from "@/components/dashboard/dashboard-panel";
import { MeterRow } from "@/components/dashboard/mix-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CommonDashboardData, CampaignsDashboardData } from "@/lib/queries/employee-dashboard";
import type { MySessionState } from "@/lib/queries/employee-status";

function hoursFromSeconds(totalSeconds: number) {
  return Math.round((totalSeconds / 3600) * 10) / 10;
}

export function StaffDashboard({
  greeting,
  firstName,
  roleLabel,
  subtitle,
  sessionState,
  commonData,
  marketingData,
  compact = false,
}: {
  greeting: string;
  firstName: string;
  roleLabel?: string;
  subtitle?: string;
  sessionState: MySessionState;
  commonData: CommonDashboardData;
  marketingData?: CampaignsDashboardData | null;
  compact?: boolean;
}) {
  const workingHours = hoursFromSeconds(commonData.activeSeconds);
  const breakHours = hoursFromSeconds(commonData.breakSeconds);
  const idleHours = hoursFromSeconds(commonData.idleSeconds);
  const hourScale = Math.max(8, workingHours, breakHours, idleHours, 0.1);

  return (
    <div className="dash-board flex flex-col">
      <DashboardPanel
        hero={
          <DashboardHero
            compact={compact}
            flush
            greeting={greeting}
            firstName={firstName}
            roleLabel={roleLabel}
            subtitle={subtitle}
          />
        }
        left={
          <div className="session-card">
            <div className="session-card-head flex shrink-0 flex-col justify-center gap-1 px-4 py-3">
              <p className="text-sm font-semibold">Your session</p>
              <p className="text-xs text-white/70">Clock, breaks, and shift progress</p>
            </div>
            <ClockWidget compact={compact} embedded session={sessionState} />
          </div>
        }
        right={
          <Card className="dash-hours gap-0 rounded-none py-0 ring-0">
            <CardHeader className="hours-card-head flex flex-col justify-center rounded-none border-0 py-3">
              <CardTitle className="text-sm font-semibold text-white">Today&apos;s hours</CardTitle>
              <p className="text-xs text-white/70">Your working, break, and idle time</p>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col justify-evenly gap-2 py-3">
              <MeterRow
                compact={compact}
                className="flex-1 justify-center"
                tone="success"
                label="Working"
                value={workingHours}
                max={hourScale}
                barClass="bg-success"
              />
              <MeterRow
                compact={compact}
                className="flex-1 justify-center"
                tone="warning"
                label="Break"
                value={breakHours}
                max={hourScale}
                barClass="bg-warning"
              />
              <MeterRow
                compact={compact}
                className="flex-1 justify-center"
                tone="info"
                label="Idle"
                value={idleHours}
                max={hourScale}
                barClass="bg-info"
              />
            </CardContent>
          </Card>
        }
        footer={<CommonStats data={commonData} compact={compact} packed />}
      />
      {marketingData ? <MarketingStats data={marketingData} compact={compact} /> : null}
    </div>
  );
}
