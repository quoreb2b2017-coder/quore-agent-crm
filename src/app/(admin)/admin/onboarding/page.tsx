import { CalendarClock, ClipboardCheck, FileSignature, Hourglass, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
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
    <div className="flex flex-col gap-6">
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

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="In onboarding"
          value={pendingRows.length}
          icon={Hourglass}
          tone="warning"
          hint="Not started or in progress"
        />
        <StatCard
          label="Offer pending"
          value={awaitingOffer}
          icon={FileSignature}
          tone="info"
          hint="Offer not accepted yet"
        />
        <StatCard label="Joining soon" value={upcoming} icon={CalendarClock} hint="Joining date ahead" />
        <StatCard
          label="Completed"
          value={completed}
          icon={ClipboardCheck}
          tone="success"
          progress={rows.length > 0 ? (completed / rows.length) * 100 : 0}
        />
      </section>

      <OnboardingTable rows={rows} today={today} />
    </div>
  );
}
