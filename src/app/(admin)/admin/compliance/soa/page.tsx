import { requireCompliance } from "@/lib/compliance/access";
import { createServiceClient } from "@/lib/supabase/service";
import { Panel, Pill } from "@/components/wt/panel";
import { humanize } from "@/lib/compliance/labels";
import { SoaRowForm } from "../compliance-forms";

export const dynamic = "force-dynamic";

export default async function SoaPage() {
  const { manage } = await requireCompliance();
  const service = createServiceClient();
  const [{ data: entries }, { data: reqs }] = await Promise.all([
    service.from("soa_entries").select("id, requirement_id, applicable, justification, implementation_status, revision"),
    service.from("framework_requirements").select("id, ref, title, category"),
  ]);
  const req = new Map((reqs ?? []).map((r) => [r.id, r]));
  const rows = (entries ?? [])
    .map((e) => ({ ...e, req: req.get(e.requirement_id) }))
    .filter((e) => e.req)
    .sort((a, b) => a.req!.ref.localeCompare(b.req!.ref, undefined, { numeric: true }));
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.req!.category ?? "Annex A";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const decided = rows.filter((r) => r.applicable !== null).length;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        {decided} of {rows.length} Annex A controls decided. Every decision needs a justification, and each save creates a new revision that needs approval again.
      </p>
      {[...groups.entries()].map(([group, list]) => (
        <Panel key={group} id={`soa-${group}`} title={`${group} · ${list.length}`}>
          <ul className="divide-y">
            {list.map((row) => (
              <li key={row.id} className="grid gap-2 px-5 py-3 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-start">
                <div className="min-w-0">
                  <p className="text-sm font-medium"><span className="font-mono text-[12.5px] text-muted-foreground">{row.req!.ref}</span> {row.req!.title}</p>
                  <p className="text-xs text-muted-foreground">Revision {row.revision}</p>
                </div>
                {manage ? (
                  <SoaRowForm entry={row} />
                ) : (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Pill tone={row.applicable === null ? "neutral" : row.applicable ? "brand" : "neutral"}>
                      {row.applicable === null ? "Not decided" : row.applicable ? "Applicable" : "Excluded"}
                    </Pill>
                    <Pill tone="info">{humanize(row.implementation_status)}</Pill>
                    <span className="text-muted-foreground">{row.justification ?? ""}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      ))}
    </div>
  );
}
