"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { ExcelDownloadButton } from "@/components/activity/excel-download-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AUDIT_AREAS, AUDIT_OPERATIONS, tableLabel } from "@/lib/audit/describe";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import { cn } from "@/lib/utils";

type Person = { id: string; full_name: string };
type Filters = { record: string; person: string; operation: string; from: string; to: string };

export function AuditFilterBar({ people, filters }: { people: Person[]; filters: Filters }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const hasFilters = Object.values(filters).some(Boolean);

  function params(next: Filters) {
    const search = new URLSearchParams();
    if (next.record) search.set("table", next.record);
    if (next.person) search.set("person", next.person);
    if (next.operation) search.set("action", next.operation);
    if (next.from) search.set("from", next.from);
    if (next.to) search.set("to", next.to);
    return search.toString();
  }

  /** Every choice applies at once and goes back to the first page. */
  function change(patch: Partial<Filters>) {
    const query = params({ ...filters, ...patch });
    startTransition(() =>
      router.push(query ? `/admin/audit-logs?${query}` : "/admin/audit-logs", { scroll: false })
    );
  }

  const selectClass = cn(NATIVE_SELECT_CLASS, "rounded-sm bg-card");

  return (
    <div className="flex flex-wrap items-end gap-3 border bg-muted px-3 py-2">
      <div className="grid gap-1">
        <Label htmlFor="audit-record" className="text-xs">
          Record type
        </Label>
        <select
          id="audit-record"
          value={filters.record}
          onChange={(event) => change({ record: event.target.value })}
          className={cn(selectClass, "w-52")}
        >
          <option value="">All records</option>
          {AUDIT_AREAS.map((area) => (
            <optgroup key={area.name} label={area.name}>
              <option value={`area:${area.name}`}>All {area.name.toLowerCase()}</option>
              {area.tables.map((table) => (
                <option key={table} value={table}>
                  {tableLabel(table)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="audit-action" className="text-xs">
          Action
        </Label>
        <select
          id="audit-action"
          value={filters.operation}
          onChange={(event) => change({ operation: event.target.value })}
          className={cn(selectClass, "w-32")}
        >
          <option value="">All actions</option>
          {AUDIT_OPERATIONS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="audit-person" className="text-xs">
          Person (did it, or it was about them)
        </Label>
        <select
          id="audit-person"
          value={filters.person}
          onChange={(event) => change({ person: event.target.value })}
          className={cn(selectClass, "w-60")}
        >
          <option value="">Anyone</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.full_name.trim()}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="audit-from" className="text-xs">
          From
        </Label>
        <Input
          id="audit-from"
          type="date"
          max={filters.to || undefined}
          value={filters.from}
          onChange={(event) => change({ from: event.target.value })}
          className="w-36 rounded-sm bg-card"
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="audit-to" className="text-xs">
          To
        </Label>
        <Input
          id="audit-to"
          type="date"
          min={filters.from || undefined}
          value={filters.to}
          onChange={(event) => change({ to: event.target.value })}
          className="w-36 rounded-sm bg-card"
        />
      </div>
      {hasFilters ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="rounded-sm"
          onClick={() => change({ record: "", person: "", operation: "", from: "", to: "" })}
        >
          <X className="size-3.5" />
          Clear
        </Button>
      ) : null}
      {isPending ? <Loader2 className="mb-2 size-4 animate-spin text-primary" aria-label="Loading" /> : null}
      <ExcelDownloadButton
        href={`/api/audit-logs/excel?${params(filters)}`}
        className="rounded-sm bg-card sm:ml-auto"
      />
    </div>
  );
}
