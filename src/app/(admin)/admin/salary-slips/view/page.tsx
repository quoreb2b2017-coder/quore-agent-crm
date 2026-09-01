import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { SalarySlipDocument } from "@/components/salary/salary-slip-document";
import { requireViewer } from "@/lib/permissions/server";
import { parseMonthParam } from "@/lib/payroll";
import { isUuid } from "@/lib/attendance-period";
import { isSuperAdminEmployee } from "@/lib/queries/admin-dashboard";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { loadOnePayslip } from "@/lib/salary-slip-generate";
import { formatMonthLabel } from "@/lib/format";

export default async function AdminViewSalarySlipPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { ctx, seesAll } = await requireViewer();
  const params = await searchParams;
  const month = parseMonthParam(params.month);
  const requested = Array.isArray(params.employee) ? params.employee[0] : params.employee;
  const requestedId = requested && isUuid(requested) ? requested : null;
  const employeeId = seesAll ? requestedId : ctx.employeeId;

  if (!employeeId) notFound();
  if (!seesAll && employeeId !== ctx.employeeId) notFound();

  const supabase = await createClient();
  if (await isSuperAdminEmployee(supabase, employeeId)) notFound();

  const slip = await loadOnePayslip(employeeId, month, ctx.employeeId);
  const backHref = seesAll
    ? `/admin/salary-slips?employee=${employeeId}&month=${month}`
    : "/admin/salary-slips";
  const pdfHref = `/api/salary-slips/pdf?employee=${employeeId}&month=${month}`;

  if (!slip) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Salary slip"
          description={formatMonthLabel(month)}
          actions={
            <Button size="sm" variant="outline" asChild>
              <Link href={backHref}>
                <ArrowLeft className="size-3.5" />
                Back
              </Link>
            </Button>
          }
        />
        <EmptyState
          icon={FileText}
          title="Payslip not available"
          description="Payroll is not set up for this employee in this month."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Salary slip"
        description={`${slip.fullName} · ${formatMonthLabel(month)}`}
        actions={
          <>
            <Button size="sm" variant="outline" asChild>
              <Link href={backHref}>
                <ArrowLeft className="size-3.5" />
                Back
              </Link>
            </Button>
            <Button size="sm" asChild>
              <a href={pdfHref}>
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
