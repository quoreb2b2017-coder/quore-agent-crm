import { Suspense } from "react";
import { DashboardPageSkeleton } from "@/components/layout/page-skeleton";
import { AdminDashboardBody } from "./admin-dashboard-body";

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  return (
    // The key shows the skeleton at once when a name is clicked, instead of a page that looks stuck.
    <Suspense key={String(params.employee ?? "all")} fallback={<DashboardPageSkeleton />}>
      <AdminDashboardBody searchParams={params} />
    </Suspense>
  );
}
