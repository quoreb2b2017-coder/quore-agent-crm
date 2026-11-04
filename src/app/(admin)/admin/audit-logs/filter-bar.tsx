"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import { tableLabel } from "@/lib/audit/describe";

type Person = { id: string; full_name: string };

export function AuditFilterBar({
  tables,
  people,
  table,
  personId,
}: {
  tables: string[];
  people: Person[];
  table?: string;
  personId: string;
}) {
  const router = useRouter();
  const hasFilters = Boolean(table || personId);

  function apply(form: HTMLFormElement) {
    const data = new FormData(form);
    const sp = new URLSearchParams();
    const t = String(data.get("table") ?? "").trim();
    const p = String(data.get("person") ?? "").trim();
    if (t) sp.set("table", t);
    if (p) sp.set("person", p);
    const qs = sp.toString();
    router.push(qs ? `/admin/audit-logs?${qs}` : "/admin/audit-logs");
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        apply(e.currentTarget);
      }}
    >
      <select
        name="table"
        defaultValue={table ?? ""}
        aria-label="Record type"
        className={`${NATIVE_SELECT_CLASS} h-9 w-48`}
        onChange={(e) => apply(e.currentTarget.form!)}
      >
        <option value="">All record types</option>
        {tables.map((t) => (
          <option key={t} value={t}>
            {tableLabel(t)}
          </option>
        ))}
      </select>
      <select
        name="person"
        defaultValue={personId}
        aria-label="Person"
        className={`${NATIVE_SELECT_CLASS} h-9 w-52`}
        onChange={(e) => apply(e.currentTarget.form!)}
      >
        <option value="">Anyone</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name.trim()}
          </option>
        ))}
      </select>
      <Button type="submit" variant="outline" className="h-9">
        Filter
      </Button>
      {hasFilters ? (
        <Button type="button" variant="ghost" className="h-9" asChild>
          <Link href="/admin/audit-logs">Clear</Link>
        </Button>
      ) : null}
    </form>
  );
}
