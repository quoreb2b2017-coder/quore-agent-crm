import Link from "next/link";
import { requireCompliance } from "@/lib/compliance/access";
import { createServiceClient } from "@/lib/supabase/service";
import { Panel, Pill } from "@/components/wt/panel";
import { Button } from "@/components/ui/button";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import { EVIDENCE_STATUS, humanize, shortDate } from "@/lib/compliance/labels";
import { EvidenceDownloadButton } from "../compliance-forms";

export const dynamic = "force-dynamic";

export default async function EvidencePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireCompliance();
  const { status } = await searchParams;
  const service = createServiceClient();
  let query = service
    .from("evidence_items")
    .select("id, control_id, title, evidence_type, source_system, collected_at, collected_by, status, reviewed_by, storage_path, period_start, period_end")
    .order("collected_at", { ascending: false })
    .limit(300);
  if (status && status in EVIDENCE_STATUS) query = query.eq("status", status as "PENDING_REVIEW");
  const [{ data: items }, { data: controls }, { data: people }] = await Promise.all([
    query,
    service.from("compliance_controls").select("id, control_code"),
    service.from("employees").select("id, full_name"),
  ]);
  const code = new Map((controls ?? []).map((c) => [c.id, c.control_code]));
  const name = new Map((people ?? []).map((p) => [p.id, p.full_name]));

  return (
    <Panel
      id="library"
      title={`Evidence library · ${(items ?? []).length}`}
      description="Every item is immutable once added. Review pending items from Approvals."
      actions={
        <form className="flex items-center gap-2">
          <select name="status" defaultValue={status ?? ""} aria-label="Status" className={`${NATIVE_SELECT_CLASS} h-9 w-48`}>
            <option value="">All statuses</option>
            {Object.entries(EVIDENCE_STATUS).map(([key, v]) => (
              <option key={key} value={key}>{v.label}</option>
            ))}
          </select>
          <Button type="submit" variant="outline" className="h-9">Filter</Button>
          <Button asChild className="h-9"><Link href="/admin/approvals">Review pending</Link></Button>
        </form>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-5 py-2.5 font-medium">Evidence</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Control</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Collected</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Period</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
              <th scope="col" className="px-5 py-2.5 font-medium"><span className="sr-only">File</span></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(items ?? []).length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">No evidence yet. Add it from a control, or run the automated checks.</td></tr>
            ) : (
              (items ?? []).map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="max-w-[22rem] px-5 py-3">
                    <p className="font-medium">{e.title}</p>
                    <p className="text-xs text-muted-foreground">{humanize(e.evidence_type)} · {e.source_system}</p>
                  </td>
                  <td className="px-3 py-3">
                    <Link href={`/admin/compliance/controls/${e.control_id}`} className="font-mono text-xs text-primary hover:underline">{code.get(e.control_id)}</Link>
                  </td>
                  <td className="px-3 py-3 text-xs">{shortDate(e.collected_at)}<span className="block text-muted-foreground">{e.collected_by ? name.get(e.collected_by) : "Automation"}</span></td>
                  <td className="px-3 py-3 text-xs">{e.period_start ? `${shortDate(e.period_start)} – ${shortDate(e.period_end)}` : "Point in time"}</td>
                  <td className="px-3 py-3"><Pill tone={EVIDENCE_STATUS[e.status]?.tone}>{EVIDENCE_STATUS[e.status]?.label}</Pill>
                    {e.reviewed_by ? <span className="mt-1 block text-xs text-muted-foreground">by {name.get(e.reviewed_by)}</span> : null}
                  </td>
                  <td className="px-5 py-3 text-right">{e.storage_path ? <EvidenceDownloadButton id={e.id} /> : null}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
