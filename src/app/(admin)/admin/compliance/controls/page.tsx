import Link from "next/link";
import { requireCompliance } from "@/lib/compliance/access";
import { createServiceClient } from "@/lib/supabase/service";
import { Panel, Pill } from "@/components/wt/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import { CONTROL_STATUS, CONTROL_STATUS_ORDER, shortDate } from "@/lib/compliance/labels";

export const dynamic = "force-dynamic";

type Search = Promise<{ status?: string; domain?: string; q?: string }>;

export default async function ControlsPage({ searchParams }: { searchParams: Search }) {
  await requireCompliance();
  const params = await searchParams;
  const service = createServiceClient();
  const [controlsRes, mapsRes, reqsRes, fwRes, testsRes, evRes, peopleRes] = await Promise.all([
    service.from("compliance_controls").select("id, control_code, title, domain, status, priority, owner_employee_id, owner_role, next_due_at").order("control_code"),
    service.from("control_requirement_mappings").select("control_id, requirement_id"),
    service.from("framework_requirements").select("id, framework_id, ref"),
    service.from("compliance_frameworks").select("id, framework_key"),
    service.from("control_tests").select("control_id, result, executed_at").order("executed_at", { ascending: false }).limit(1000),
    service.from("evidence_items").select("control_id, status"),
    service.from("employees").select("id, full_name"),
  ]);

  const all = controlsRes.data ?? [];
  const domains = [...new Set(all.map((c) => c.domain))].sort();
  const q = (params.q ?? "").trim().toLowerCase();
  const controls = all.filter(
    (c) =>
      (!params.status || c.status === params.status) &&
      (!params.domain || c.domain === params.domain) &&
      (!q || `${c.control_code} ${c.title}`.toLowerCase().includes(q))
  );

  const fwKey = new Map((fwRes.data ?? []).map((f) => [f.id, f.framework_key]));
  const req = new Map((reqsRes.data ?? []).map((r) => [r.id, { ref: r.ref, fw: fwKey.get(r.framework_id) }]));
  const refs = new Map<string, { iso: string[]; soc: string[] }>();
  for (const m of mapsRes.data ?? []) {
    const r = req.get(m.requirement_id);
    if (!r) continue;
    const entry = refs.get(m.control_id) ?? { iso: [], soc: [] };
    (r.fw?.startsWith("ISO") ? entry.iso : entry.soc).push(r.ref);
    refs.set(m.control_id, entry);
  }
  const latest = new Map<string, { result: string; executed_at: string }>();
  for (const t of testsRes.data ?? []) if (!latest.has(t.control_id)) latest.set(t.control_id, t);
  const evidence = new Map<string, { accepted: number; pending: number }>();
  for (const e of evRes.data ?? []) {
    const entry = evidence.get(e.control_id) ?? { accepted: 0, pending: 0 };
    if (e.status === "ACCEPTED") entry.accepted += 1;
    if (e.status === "PENDING_REVIEW") entry.pending += 1;
    evidence.set(e.control_id, entry);
  }
  const people = new Map((peopleRes.data ?? []).map((p) => [p.id, p.full_name]));

  return (
    <Panel
      id="register"
      title={`Control register · ${controls.length}${controls.length !== all.length ? ` of ${all.length}` : ""}`}
      description="Each control is mapped to ISO 27001 Annex A and SOC 2 criteria. Open one to add evidence, record a test or change its status."
      actions={
        <form className="flex flex-wrap items-center gap-2" role="search">
          <Input name="q" defaultValue={params.q ?? ""} placeholder="Search code or title" aria-label="Search controls" className="h-9 w-48" />
          <select name="status" defaultValue={params.status ?? ""} aria-label="Status" className={`${NATIVE_SELECT_CLASS} h-9 w-44`}>
            <option value="">All statuses</option>
            {CONTROL_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{CONTROL_STATUS[s].label}</option>
            ))}
          </select>
          <select name="domain" defaultValue={params.domain ?? ""} aria-label="Domain" className={`${NATIVE_SELECT_CLASS} h-9 w-44`}>
            <option value="">All domains</option>
            {domains.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <Button type="submit" variant="outline" className="h-9">Filter</Button>
          {params.q || params.status || params.domain ? (
            <Link href="/admin/compliance/controls" className="text-[13px] font-medium text-primary hover:underline">Clear</Link>
          ) : null}
        </form>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-5 py-2.5 font-medium">Control</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
              <th scope="col" className="px-3 py-2.5 font-medium">ISO 27001</th>
              <th scope="col" className="px-3 py-2.5 font-medium">SOC 2</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Owner</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Latest test</th>
              <th scope="col" className="px-5 py-2.5 font-medium">Evidence</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {controls.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">No controls match these filters.</td>
              </tr>
            ) : (
              controls.map((c) => {
                const r = refs.get(c.id);
                const t = latest.get(c.id);
                const ev = evidence.get(c.id);
                return (
                  <tr key={c.id} className="align-top transition hover:bg-muted/30">
                    <td className="max-w-[24rem] px-5 py-3">
                      <Link href={`/admin/compliance/controls/${c.id}`} className="font-medium hover:text-primary hover:underline">
                        <span className="font-mono text-[12.5px] text-muted-foreground">{c.control_code}</span> {c.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">{c.domain}{c.priority ? ` · ${c.priority}` : ""}</p>
                    </td>
                    <td className="px-3 py-3"><Pill tone={CONTROL_STATUS[c.status].tone}>{CONTROL_STATUS[c.status].label}</Pill></td>
                    <td className="max-w-[10rem] px-3 py-3 font-mono text-xs">{r?.iso.join(", ") || "—"}</td>
                    <td className="max-w-[9rem] px-3 py-3 font-mono text-xs">{r?.soc.join(", ") || "—"}</td>
                    <td className="px-3 py-3 text-xs">
                      {c.owner_employee_id ? people.get(c.owner_employee_id) : <span className="text-[#b54708]">{c.owner_role ? `${c.owner_role} (no person)` : "Not assigned"}</span>}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {t ? (
                        <>
                          <Pill tone={t.result === "PASS" ? "success" : "danger"}>{t.result.toLowerCase()}</Pill>
                          <span className="mt-1 block text-muted-foreground">{shortDate(t.executed_at)}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Never tested</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs">
                      {ev ? `${ev.accepted} accepted · ${ev.pending} to review` : <span className="text-muted-foreground">None</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
