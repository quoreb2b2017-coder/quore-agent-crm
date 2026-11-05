import { redirect } from "next/navigation";
import { isUndecidedLeaveType } from "@/lib/leave";
import { requireViewer } from "@/lib/permissions/server";
import { isManagement } from "@/lib/permissions/roles";
import { loadApprovals } from "@/lib/queries/approvals";
import { PageHeader } from "@/components/dashboard/page-header";
import { ApprovalsInbox } from "./approvals-inbox";

export const metadata = { title: "Approvals · WorkTrack" };

export default async function ApprovalsPage() {
  const { ctx } = await requireViewer();
  if (!isManagement(ctx.roleKey)) redirect("/admin/dashboard");
  const data = await loadApprovals(ctx);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Approvals"
        description="Every request that needs a decision, in one place. Each decision is recorded with your name and the time in the audit log."
      />
      <ApprovalsInbox
        items={data.items}
        counts={data.counts}
        leaveTypes={data.leaveTypes.filter((type) => !isUndecidedLeaveType(type.name))}
      />
    </div>
  );
}
