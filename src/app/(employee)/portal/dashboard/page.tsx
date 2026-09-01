import { Suspense } from "react";
import { DashboardPageSkeleton } from "@/components/layout/page-skeleton";
import { PortalDashboardBody } from "./portal-dashboard-body";

export default function EmployeeDashboardPage() {
  return (
    <Suspense fallback={<DashboardPageSkeleton />}>
      <PortalDashboardBody />
    </Suspense>
  );
}
