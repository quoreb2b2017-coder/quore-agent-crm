"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AuditOperationTone } from "@/lib/audit/describe";
import { sheetCellClassName, sheetHeadClassName, sheetRowClassName } from "@/lib/sheet-styles";
import { cn } from "@/lib/utils";
import { loadAuditEntryDetail, type AuditEntryDetail } from "./actions";

export type AuditTableRow = {
  id: string;
  seq: number | null;
  when: string;
  who: string;
  whoId: string | null;
  source: string | null;
  operation: string;
  tone: AuditOperationTone;
  what: string;
  employee: string | null;
  employeeId: string | null;
  fields: string[];
  sealed: boolean;
};

const toneClass: Record<AuditOperationTone, string> = {
  success: "bg-success/10 text-success",
  info: "bg-info/10 text-info",
  danger: "bg-destructive/10 text-destructive",
  warning: "bg-warning/15 text-warning",
  neutral: "bg-muted text-muted-foreground",
};

const MAX_FIELD_TAGS = 3;

function FieldTags({ fields }: { fields: string[] }) {
  if (fields.length === 0) return <span className="text-muted-foreground">—</span>;
  const extra = fields.length - MAX_FIELD_TAGS;
  return (
    <span className="flex flex-wrap items-center gap-1" title={fields.join(", ").replaceAll("_", " ")}>
      {fields.slice(0, MAX_FIELD_TAGS).map((field) => (
        <span key={field} className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium">
          {field.replaceAll("_", " ")}
        </span>
      ))}
      {extra > 0 ? <span className="text-[11px] font-semibold text-muted-foreground">+{extra} more</span> : null}
    </span>
  );
}

function EntryDetail({ detail }: { detail: AuditEntryDetail }) {
  return (
    <div className="flex flex-col gap-2 p-3">
      {detail.fields.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No field values were recorded for this entry.</p>
      ) : (
        <div className="overflow-x-auto border bg-card">
          <table className="w-full border-separate border-spacing-0 text-left text-[13px]">
            <thead>
              <tr className="bg-secondary text-[11px] font-bold tracking-wider uppercase">
                <th className="w-48 border-r border-b px-3 py-1.5">Field</th>
                <th className="border-r border-b px-3 py-1.5">Before</th>
                <th className="border-b px-3 py-1.5">After</th>
              </tr>
            </thead>
            <tbody>
              {detail.fields.map((change) => (
                <tr key={change.field}>
                  <td className="border-r border-b px-3 py-1.5 align-top font-medium">
                    {change.field.replaceAll("_", " ")}
                  </td>
                  <td className="border-r border-b px-3 py-1.5 align-top break-all text-muted-foreground">
                    {change.before ?? "—"}
                  </td>
                  <td className="border-b px-3 py-1.5 align-top font-medium break-all">{change.after ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
        {detail.recordId ? (
          <div className="flex gap-1">
            <dt className="font-semibold">Record</dt>
            <dd className="font-mono">{detail.recordId}</dd>
          </div>
        ) : null}
        {detail.requestId ? (
          <div className="flex gap-1">
            <dt className="font-semibold">Request</dt>
            <dd className="font-mono">{detail.requestId}</dd>
          </div>
        ) : null}
        {detail.rowHash ? (
          <div className="flex min-w-0 gap-1">
            <dt className="font-semibold">Seal</dt>
            <dd className="font-mono break-all">{detail.rowHash}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

export function AuditTable({ rows }: { rows: AuditTableRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, AuditEntryDetail | { error: string }>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function toggle(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    if (details[id]) return;
    setLoadingId(id);
    const result = await loadAuditEntryDetail(id);
    setDetails((current) => ({ ...current, [id]: result }));
    setLoadingId((current) => (current === id ? null : current));
  }

  return (
    <div className="[&>[data-slot=table-container]]:max-h-[calc(100svh-17rem)] [&>[data-slot=table-container]]:min-h-64">
      <Table className="border-separate border-spacing-0">
        <TableHeader className="sticky top-0 z-10">
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(sheetHeadClassName, "w-10 px-1")}>
              <span className="sr-only">Details</span>
            </TableHead>
            <TableHead className={sheetHeadClassName}>When</TableHead>
            <TableHead className={sheetHeadClassName}>Who</TableHead>
            <TableHead className={sheetHeadClassName}>Action</TableHead>
            <TableHead className={sheetHeadClassName}>What happened</TableHead>
            <TableHead className={sheetHeadClassName}>Employee</TableHead>
            <TableHead className={sheetHeadClassName}>Fields changed</TableHead>
            <TableHead className={cn(sheetHeadClassName, "border-r-0")}>Seal</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const open = openId === row.id;
            const detail = details[row.id];
            return (
              <Fragment key={row.id}>
                <TableRow
                  className={cn(sheetRowClassName, "cursor-pointer", open && "bg-accent even:bg-accent")}
                  onClick={() => void toggle(row.id)}
                >
                  <TableCell className={cn(sheetCellClassName, "px-1 text-center")}>
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-label={open ? "Hide details" : "Show details"}
                      className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-card"
                    >
                      {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </button>
                  </TableCell>
                  <TableCell className={cn(sheetCellClassName, "text-xs")}>{row.when}</TableCell>
                  <TableCell className={sheetCellClassName}>
                    {row.whoId ? (
                      <Link
                        href={`/admin/employees/${row.whoId}`}
                        onClick={(event) => event.stopPropagation()}
                        className="font-semibold text-primary underline-offset-2 hover:underline"
                      >
                        {row.who}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{row.who}</span>
                    )}
                    {row.source ? (
                      <span className="block text-[11px] text-muted-foreground">{row.source}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className={sheetCellClassName}>
                    <span className={cn("rounded-sm px-1.5 py-0.5 text-[11px] font-bold", toneClass[row.tone])}>
                      {row.operation}
                    </span>
                  </TableCell>
                  <TableCell className={cn(sheetCellClassName, "font-medium")}>{row.what}</TableCell>
                  <TableCell className={sheetCellClassName}>
                    {row.employeeId && row.employee ? (
                      <Link
                        href={`/admin/employees/${row.employeeId}`}
                        onClick={(event) => event.stopPropagation()}
                        className="font-semibold text-primary underline-offset-2 hover:underline"
                      >
                        {row.employee}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className={cn(sheetCellClassName, "min-w-48 whitespace-normal")}>
                    <FieldTags fields={row.fields} />
                  </TableCell>
                  <TableCell className={cn(sheetCellClassName, "border-r-0")}>
                    {row.sealed ? (
                      <span className="rounded-sm bg-success/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-success">
                        #{row.seq}
                      </span>
                    ) : (
                      <span className="rounded-sm bg-warning/15 px-1.5 py-0.5 text-[11px] font-semibold text-warning">
                        Unsealed
                      </span>
                    )}
                  </TableCell>
                </TableRow>
                {open ? (
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableCell colSpan={8} className="border-b p-0 whitespace-normal">
                      {loadingId === row.id && !detail ? (
                        <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground" role="status">
                          <Loader2 className="size-4 animate-spin" /> Loading details…
                        </p>
                      ) : detail && "error" in detail ? (
                        <p className="p-4 text-sm text-destructive">{detail.error}</p>
                      ) : detail ? (
                        <EntryDetail detail={detail} />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
