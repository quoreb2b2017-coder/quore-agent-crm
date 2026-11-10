import Link from "next/link";
import { SheetKpi } from "@/components/dashboard/sheet-kpi";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireCompliance } from "@/lib/compliance/access";
import { formatDateTime } from "@/lib/format";
import { acknowledgementReport } from "@/lib/queries/policies";
import { sheetCellClassName, sheetHeadClassName, sheetRowClassName } from "@/lib/sheet-styles";
import { cn } from "@/lib/utils";

export const metadata = { title: "Acknowledgements · WorkTrack" };

/** Evidence for WT-PRV-01 and WT-PPL-01: who has read each notice in its current version. */
export default async function AcknowledgementsPage() {
  await requireCompliance();
  const report = await acknowledgementReport();

  if (!report.ready) {
    return (
      <p className="border bg-card px-4 py-6 text-sm text-muted-foreground">
        Acknowledgements are not set up yet. Run supabase/migrations/0044_policy_acknowledgements.sql in Supabase.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {report.documents.map(({ document, rows }) => {
        if (!document.live) {
          return (
            <section key={`${document.key}-${document.version}`} className="border border-dashed bg-card">
              <div className="flex flex-wrap items-center gap-2 border-b bg-muted px-3 py-2">
                <h2 className="text-sm font-semibold">{document.title}</h2>
                <span className="wt-pill rounded-sm text-[11px] font-semibold" data-tone="warning">
                  Draft · not shown to staff
                </span>
              </div>
              <p className="border-b px-3 py-2 text-xs text-muted-foreground">
                Read the text below. When management approves it, it is switched on and everyone is asked to
                acknowledge it the next time they open WorkTrack.
              </p>
              <div className="grid gap-x-6 gap-y-3 px-3 py-3 md:grid-cols-2">
                {document.sections.map((section) => (
                  <div key={section.heading}>
                    <h3 className="text-[13px] font-semibold">{section.heading}</h3>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-muted-foreground">
                      {section.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          );
        }
        const done = rows.filter((row) => row.acknowledgedAt).length;
        // Not yet read first, so the people to chase are at the top.
        const sorted = [...rows].sort(
          (a, b) => Number(Boolean(a.acknowledgedAt)) - Number(Boolean(b.acknowledgedAt)) || a.fullName.localeCompare(b.fullName)
        );
        return (
          <section key={`${document.key}-${document.version}`} className="border bg-card">
            <div className="border-b bg-muted px-3 py-2">
              <h2 className="text-sm font-semibold">{document.title}</h2>
              <p className="text-xs text-muted-foreground">
                Version {document.version}. People are asked when they next open WorkTrack.
              </p>
            </div>
            <dl className="grid grid-cols-3 border-b">
              <SheetKpi label="People" value={rows.length} />
              <SheetKpi label="Read" value={done} valueClassName="text-success" />
              <SheetKpi
                label="Not yet"
                value={rows.length - done}
                valueClassName={rows.length - done > 0 ? "text-destructive" : undefined}
              />
            </dl>
            <div className="[&>[data-slot=table-container]]:max-h-[60svh]">
              <Table className="border-separate border-spacing-0">
                <TableHeader className="sticky top-0 z-10">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={sheetHeadClassName}>Name</TableHead>
                    <TableHead className={sheetHeadClassName}>Employee ID</TableHead>
                    <TableHead className={cn(sheetHeadClassName, "border-r-0")}>Read on</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((row) => (
                    <TableRow key={row.employeeId} className={sheetRowClassName}>
                      <TableCell className={sheetCellClassName}>
                        <Link
                          href={`/admin/employees/${row.employeeId}`}
                          className="font-semibold text-primary underline-offset-2 hover:underline"
                        >
                          {row.fullName}
                        </Link>
                      </TableCell>
                      <TableCell className={cn(sheetCellClassName, "font-mono text-xs font-semibold")}>
                        {row.employeeCode}
                      </TableCell>
                      <TableCell
                        className={cn(
                          sheetCellClassName,
                          "border-r-0",
                          row.acknowledgedAt ? "text-muted-foreground" : "font-semibold text-destructive"
                        )}
                      >
                        {row.acknowledgedAt ? formatDateTime(row.acknowledgedAt) : "Not yet"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
