import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmployeeProductivityOverview } from "@/components/dashboard/employee-productivity-overview";
import { shiftWindowLabel } from "@/lib/format";
import { PRODUCTIVE_HOURS_LABEL } from "@/lib/shift";

export default async function MyProductivityPage() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Productivity"
        description={`${shiftWindowLabel()} · target ${PRODUCTIVE_HOURS_LABEL} productive of 9 hrs`}
      />
      <EmployeeProductivityOverview employeeId={ctx.employeeId} />
    </div>
  );
}
