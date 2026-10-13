import { Radio } from "lucide-react";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { ShiftTimeline } from "@/components/activity/shift-timeline";
import { shiftWindowLabel, todayIso } from "@/lib/format";
import { getShiftActivity } from "@/lib/queries/shift-activity";

export default async function MyActivityPage() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return null;

  const events = await getShiftActivity(
    [{ id: ctx.employeeId, fullName: ctx.fullName, employeeCode: ctx.employeeCode }],
    todayIso()
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My Activity"
        description={`${shiftWindowLabel()} · from login through every action`}
      />
      {events.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Radio}
              title="No session recorded yet today"
              description="Clock in from Attendance. Tea, lunch, washroom, and meetings will show here."
            />
          </CardContent>
        </Card>
      ) : (
        <ShiftTimeline events={events} showEmployee={false} />
      )}
    </div>
  );
}
