import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Wallet } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { SalarySlipDocument } from "@/components/salary/salary-slip-document";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { parseMonthParam } from "@/lib/payroll";
import { loadOnePayslip } from "@/lib/salary-slip-generate";
import { formatMonthLabel } from "@/lib/format";

export default async function PortalViewSalarySlipPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) notFound();

  const params = await searchParams;
  const month = parseMonthParam(params.month);
  const slip = await loadOnePayslip(ctx.employeeId, month, ctx.employeeId);

  if (!slip) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Salary slip"
          description={formatMonthLabel(month)}
          actions={
            <Button size="sm" variant="outline" asChild>
              <Link href="/portal/salary-slips">
                <ArrowLeft className="size-3.5" />
                Back
              </Link>
            </Button>
          }
        />
        <EmptyState
          icon={Wallet}
          title="Payslip not available"
          description="Payroll is not set up for this month yet."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Salary slip"
        description={formatMonthLabel(month)}
        actions={
          <>
            <Button size="sm" variant="outline" asChild>
              <Link href="/portal/salary-slips">
                <ArrowLeft className="size-3.5" />
                Back
              </Link>
            </Button>
            <Button size="sm" asChild>
              <a href={`/api/salary-slips/pdf?employee=${ctx.employeeId}&month=${month}`}>
                <Download className="size-3.5" />
                Download PDF
              </a>
            </Button>
          </>
        }
      />
      <SalarySlipDocument slip={slip} />
    </div>
  );
}
