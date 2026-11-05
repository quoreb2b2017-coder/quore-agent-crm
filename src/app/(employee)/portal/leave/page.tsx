import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { PageHeader } from "@/components/dashboard/page-header";
import { todayIso } from "@/lib/format";
import { getPaidLeaveQuota, listLeaveHistory } from "@/lib/queries/leave";
import { LeaveHistorySheet } from "@/components/leave/leave-history-sheet";
import { LeaveQuotaPanel } from "@/components/leave/leave-quota-panel";
import { ApplyLeaveDialog } from "./apply-leave-dialog";

export default async function MyLeavePage() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return null;

  const supabase = await createClient();
  const year = Number(todayIso().slice(0, 4));

  const [{ data: leaveTypes }, quota, history] = await Promise.all([
    supabase.from("leave_types").select("id, name, is_paid").order("name"),
    getPaidLeaveQuota({ employeeIds: [ctx.employeeId], year, people: 1 }),
    listLeaveHistory([ctx.employeeId], year),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Leave"
        description={`Used ${quota.used} of ${quota.available} days. ${quota.remaining} left. Only your leave is shown.`}
        actions={<ApplyLeaveDialog />}
      />

      <LeaveQuotaPanel
        year={year}
        available={quota.available}
        used={quota.used}
        remaining={quota.remaining}
        pending={quota.pending}
        peopleLabel={`${ctx.fullName} · used ${quota.used} · ${quota.remaining} left`}
      />

      <LeaveHistorySheet
        rows={history}
        leaveTypes={leaveTypes ?? []}
        emptyTitle="You have not taken leave this year"
      />
    </div>
  );
}
