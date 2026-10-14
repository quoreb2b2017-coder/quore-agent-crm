import type { ReactNode } from "react";
import { ClockWidget } from "@/components/attendance/clock-widget";
import { CommonStats } from "@/components/dashboards/common-stats";
import { MarketingStats } from "@/components/dashboards/marketing-stats";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { DashboardPanel } from "@/components/dashboard/dashboard-panel";
import { TodayHours } from "@/components/dashboard/today-hours";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CommonDashboardData, CampaignsDashboardData } from "@/lib/queries/employee-dashboard";
import type { MySessionState } from "@/lib/queries/employee-status";

export function StaffDashboard({
  greeting,
  firstName,
  roleLabel,
  subtitle,
  sessionState,
  commonData,
  marketingData,
  activity,
  compact = false,
  readOnly = false,
  sessionTitle = "Your session",
  sessionHint = "Clock, breaks, and shift progress",
  toolbar,
}: {
  greeting: string;
  firstName: string;
  roleLabel?: string;
  subtitle?: string;
  sessionState: MySessionState;
  commonData: CommonDashboardData;
  marketingData?: CampaignsDashboardData | null;
  activity?: ReactNode;
  compact?: boolean;
  readOnly?: boolean;
  sessionTitle?: string;
  sessionHint?: string;
  toolbar?: ReactNode;
}) {
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
            <div className="session-card-head flex shrink-0 flex-col justify-center gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">{sessionTitle}</p>
                <p className="text-xs text-white/70">{sessionHint}</p>
              </div>
              {toolbar}
            </div>
            <ClockWidget compact={compact} readOnly={readOnly} embedded fill={!activity} session={sessionState} />
            {activity ? (
              <div className="border-t">
                <div className="hours-card-head flex flex-col justify-center gap-1 px-4 py-3">
                  <p className="text-sm font-semibold">Today&apos;s hours</p>
                  <p className="text-xs text-white/70">Your working, break, and idle time</p>
                </div>
                <div className="flex flex-col gap-2 px-4 py-3">
                  <TodayHours compact session={sessionState} idleSeconds={commonData.idleSeconds} />
                </div>
              </div>
            ) : null}
          </div>
        }
        right={
          activity ?? (
          <Card className="dash-hours gap-0 rounded-none py-0 ring-0">
            <CardHeader className="hours-card-head flex flex-col justify-center rounded-none border-0 py-3">
              <CardTitle className="text-sm font-semibold text-white">Today&apos;s hours</CardTitle>
              <p className="text-xs text-white/70">Your working, break, and idle time</p>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col justify-evenly gap-2 py-3">
              <TodayHours compact={compact} session={sessionState} idleSeconds={commonData.idleSeconds} />
            </CardContent>
          </Card>
          )
        }
        activityFirst={!!activity}
        footer={<CommonStats data={commonData} compact={compact} packed />}
      />
      {marketingData ? <MarketingStats data={marketingData} compact={compact} /> : null}
    </div>
  );
}
