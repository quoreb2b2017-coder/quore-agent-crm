import { UserPlus } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { SheetKpi } from "@/components/dashboard/sheet-kpi";
import { Button } from "@/components/ui/button";
import { requireManagement } from "@/lib/permissions/server";
import { listOnboarding } from "@/lib/queries/onboarding";
import { todayIso } from "@/lib/format";
import { ONBOARDING_STEPS } from "@/lib/onboarding";
import { loadEmployeeDirectory } from "@/lib/queries/employee-directory";
import { loadDepartments } from "@/lib/queries/departments";
import { CreateEmployeeDialog } from "../employees/create-employee-dialog";
import { OnboardingTable } from "./onboarding-table";
import { MigrationNotice } from "./migration-notice";

export default async function OnboardingPage() {
  await requireManagement();
  const [result, directory, departments] = await Promise.all([
    listOnboarding(),
    loadEmployeeDirectory(),
    loadDepartments(),
  ]);

  if (result.missingTable) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Onboarding" description="Bring new joiners in step by step." />
        <MigrationNotice />
      </div>
    );
  }

  const { rows } = result;
  const today = todayIso();
  const pendingRows = rows.filter((row) => row.status !== "COMPLETED");
  const completed = rows.length - pendingRows.length;
  const awaitingOffer = pendingRows.filter((row) => row.currentStep === "offer").length;
  const upcoming = rows.filter((row) => row.joiningDate > today).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Onboarding"
        description={`${ONBOARDING_STEPS.length} simple steps for every new joiner — offer letter to first week.`}
        actions={
          <CreateEmployeeDialog
            key={`add-emp-${directory.length}-${departments.map((d) => d.id).join(",")}`}
            redirectToOnboarding
            employees={directory}
            departments={departments}
            trigger={
              <Button>
                <UserPlus className="size-4" />
                New joiner
              </Button>
            }
          />
        }
      />

      <div className="flex flex-col [&>*+*]:-mt-px">
        <dl className="grid grid-cols-2 border bg-card xl:grid-cols-4">
          <SheetKpi
            label="In onboarding"
            value={pendingRows.length}
            valueClassName="text-warning"
            hint="Not started or in progress"
          />
          <SheetKpi
            label="Offer pending"
            value={awaitingOffer}
            valueClassName="text-info"
            hint="Offer not accepted yet"
          />
          <SheetKpi label="Joining soon" value={upcoming} hint="Joining date ahead" />
          <SheetKpi
            label="Completed"
            value={completed}
            valueClassName="text-success"
            hint={`of ${rows.length} joiners`}
            progress={rows.length > 0 ? (completed / rows.length) * 100 : 0}
          />
        </dl>

        <OnboardingTable rows={rows} today={today} />
      </div>
    </div>
  );
}
