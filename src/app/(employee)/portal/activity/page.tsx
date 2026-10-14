import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { MyActivityLog } from "@/components/activity/my-activity-log";
import { shiftWindowLabel } from "@/lib/format";
import { buildActivityDays } from "@/lib/queries/shift-activity";

export default async function MyActivityPage() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return null;

  const days = await buildActivityDays(
    {
      id: ctx.employeeId,
      fullName: ctx.fullName,
      employeeCode: ctx.employeeCode,
    },
    30
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My Activity"
        description={`${shiftWindowLabel()} · your own login, breaks, washroom, and meetings`}
      />
      <MyActivityLog days={days} />
    </div>
  );
}
