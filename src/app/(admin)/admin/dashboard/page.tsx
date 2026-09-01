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
    <Suspense fallback={<DashboardPageSkeleton />}>
      <AdminDashboardBody searchParams={params} />
    </Suspense>
  );
}
