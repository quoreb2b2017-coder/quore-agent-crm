"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Inbox, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { acceptMeeting, rejectMeeting } from "@/lib/actions/attendance";
import { reviewLeaveRequest } from "@/lib/actions/leave";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { sheetCellClassName, sheetHeadClassName, sheetRowClassName } from "@/lib/sheet-styles";
import { cn } from "@/lib/utils";
import type { ApprovalItem, ApprovalKind } from "@/lib/queries/approvals";
import { decideException, reviewEvidence } from "./actions";
import { decideSalaryChange } from "../payroll/actions";

const KIND_META: Record<ApprovalKind, { label: string; tone: string }> = {
  MEETING: { label: "Meeting", tone: "info" },
  LEAVE: { label: "Leave", tone: "warning" },
  SALARY: { label: "Salary", tone: "danger" },
  EVIDENCE: { label: "Evidence", tone: "brand" },
  EXCEPTION: { label: "Exception", tone: "danger" },
};

const TABS: { key: ApprovalKind | "ALL"; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "MEETING", label: "Meetings" },
  { key: "LEAVE", label: "Leave" },
  { key: "SALARY", label: "Salary" },
  { key: "EVIDENCE", label: "Evidence" },
  { key: "EXCEPTION", label: "Exceptions" },
];

export function ApprovalsInbox({
  items,
  counts,
  leaveTypes,
}: {
  items: ApprovalItem[];
  counts: Record<ApprovalKind | "ALL", number>;
  /** Only types that say paid or unpaid; "Awaiting decision" cannot be approved. */
  leaveTypes: { id: string; name: string; is_paid: boolean }[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<ApprovalKind | "ALL">("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const [note, setNote] = useState("");
  const [leaveType, setLeaveType] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const visible = useMemo(() => items.filter((item) => tab === "ALL" || item.kind === tab), [items, tab]);
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0] ?? null;
  const requestedType = leaveTypes.some((type) => type.id === selected?.leaveTypeId) ? selected?.leaveTypeId : "";
  const chosenLeaveType = leaveType || requestedType || "";
  const needsLeaveType = selected?.kind === "LEAVE" && !chosenLeaveType;

  function select(id: string) {
    setSelectedId(id);
    setNote("");
    setLeaveType("");
  }

  function run(action: () => Promise<{ error?: string } | undefined>, success: string) {
    startTransition(async () => {
      const res = await action();
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success(success);
      setNote("");
      setLeaveType("");
      setSelectedId(null);
      router.refresh();
    });
  }

  function decide(approve: boolean) {
    if (!selected) return;
    switch (selected.kind) {
      case "MEETING":
        return run(() => (approve ? acceptMeeting(selected.id) : rejectMeeting(selected.id)), approve ? "Meeting accepted" : "Meeting rejected");
      case "LEAVE":
        return run(
          () => reviewLeaveRequest(selected.id, approve ? "APPROVED" : "REJECTED", approve ? chosenLeaveType : undefined),
          approve ? "Leave approved" : "Leave rejected"
        );
      case "SALARY":
        return run(() => decideSalaryChange(selected.id, approve, note), approve ? "Salary change approved" : "Salary change rejected");
      case "EVIDENCE":
        return run(() => reviewEvidence(selected.id, approve ? "ACCEPTED" : "REJECTED", note), approve ? "Evidence accepted" : "Evidence rejected");
      case "EXCEPTION":
        return run(() => decideException(selected.id, approve ? "APPROVED" : "REJECTED"), approve ? "Exception approved" : "Exception rejected");
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 border bg-card px-6 py-16 text-center">
        <CheckCircle2 className="size-8 text-success" aria-hidden />
        <p className="text-base font-semibold">You are all caught up</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Meeting requests, leave requests, salary changes, evidence reviews and security exceptions will appear here when they need you.
        </p>
      </div>
    );
  }

  const approveLabel =
    selected?.kind === "MEETING" ? "Accept" : selected?.kind === "EVIDENCE" ? "Accept evidence" : "Approve";

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section aria-label="Requests" className="min-w-0 border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted px-3 py-2">
          <div role="tablist" aria-label="Filter approvals" className="inline-flex flex-wrap divide-x rounded-sm border bg-card">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                disabled={t.key !== "ALL" && counts[t.key] === 0}
                className={cn(
                  "inline-flex h-[calc(2rem-2px)] items-center gap-1.5 px-3 text-xs font-semibold transition-colors disabled:opacity-40",
                  tab === t.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {t.label}
                <span className="tabular-nums">{counts[t.key]}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Click a row to decide it</p>
        </div>
        <div className="[&>[data-slot=table-container]]:max-h-[calc(100svh-15rem)]">
          <Table className="border-separate border-spacing-0">
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(sheetHeadClassName, "w-24")}>Type</TableHead>
                <TableHead className={sheetHeadClassName}>Request</TableHead>
                <TableHead className={sheetHeadClassName}>Requested by</TableHead>
                <TableHead className={sheetHeadClassName}>Details</TableHead>
                <TableHead className={cn(sheetHeadClassName, "w-24 border-r-0")}>Waiting</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((item) => {
                const active = selected?.id === item.id;
                return (
                  <TableRow
                    key={item.id}
                    aria-selected={active}
                    className={cn(sheetRowClassName, "cursor-pointer", active && "bg-accent even:bg-accent")}
                    onClick={() => select(item.id)}
                  >
                    <TableCell
                      className={cn(sheetCellClassName, active && "shadow-[inset_3px_0_0_0_var(--primary)]")}
                    >
                      <span
                        className="wt-pill rounded-sm text-[11px] font-semibold"
                        data-tone={KIND_META[item.kind].tone}
                      >
                        {KIND_META[item.kind].label}
                      </span>
                    </TableCell>
                    <TableCell className={cn(sheetCellClassName, "min-w-56 whitespace-normal")}>
                      <button
                        type="button"
                        aria-current={active ? "true" : undefined}
                        className="text-left font-semibold underline-offset-2 hover:underline"
                      >
                        {item.title}
                      </button>
                    </TableCell>
                    <TableCell className={sheetCellClassName}>
                      {item.requesterId ? (
                        <Link
                          href={`/admin/employees/${item.requesterId}`}
                          onClick={(event) => event.stopPropagation()}
                          className="font-semibold text-primary underline-offset-2 hover:underline"
                        >
                          {item.requesterName}
                        </Link>
                      ) : (
                        item.requesterName || <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className={cn(sheetCellClassName, "min-w-52 whitespace-normal text-muted-foreground")}>
                      {item.subtitle}
                    </TableCell>
                    <TableCell className={cn(sheetCellClassName, "border-r-0 text-muted-foreground")}>
                      {formatRelativeTime(item.requestedAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="border-t bg-muted px-3 py-1.5 text-xs text-muted-foreground tabular-nums">
          Showing <span className="font-semibold text-foreground">{visible.length}</span> of{" "}
          <span className="font-semibold text-foreground">{items.length}</span> waiting for you
        </p>
      </section>

      {selected ? (
        <section aria-label="Request detail" className="flex min-w-0 flex-col border bg-card xl:sticky xl:top-0">
          <div className="flex flex-col gap-1 border-b bg-muted px-3 py-2">
            <span className="wt-pill self-start rounded-sm text-[11px] font-semibold" data-tone={KIND_META[selected.kind].tone}>
              {KIND_META[selected.kind].label}
            </span>
            <h2 className="text-sm font-semibold">{selected.title}</h2>
            <p className="text-xs text-muted-foreground">{selected.subtitle}</p>
          </div>
          <dl className="border-b">
            {selected.details.map((d) => (
              <div key={d.label} className="grid grid-cols-[8.5rem_minmax(0,1fr)] border-b last:border-b-0">
                <dt className="border-r bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">{d.label}</dt>
                <dd className="px-3 py-2 text-[13px] font-medium break-words">
                  {/^\d{4}-\d{2}-\d{2}T/.test(d.value) ? formatDateTime(d.value) : d.value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-3 p-3">
            <div className="flex gap-2 rounded-sm border bg-muted/40 p-2.5 text-[12.5px] leading-relaxed text-foreground/80">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>{selected.rule}</span>
            </div>

            {selected.kind === "LEAVE" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="leave-type">Approve as</Label>
                <select
                  id="leave-type"
                  className={cn(NATIVE_SELECT_CLASS, "rounded-sm")}
                  value={chosenLeaveType}
                  onChange={(event) => setLeaveType(event.target.value)}
                >
                  <option value="" disabled>
                    Choose paid or unpaid…
                  </option>
                  {leaveTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name} {type.is_paid ? "(paid)" : "(unpaid)"}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {selected.kind === "EVIDENCE" || selected.kind === "SALARY" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="review-note">
                  {selected.kind === "SALARY" ? "Note for HR" : "Review note"}{" "}
                  <span className="font-normal text-muted-foreground">
                    {selected.kind === "SALARY" ? "(optional)" : "(required to reject)"}
                  </span>
                </Label>
                <Textarea
                  id="review-note"
                  rows={3}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="What you checked, or why it is not enough"
                />
              </div>
            ) : null}

            {selected.selfBlocked ? (
              <p role="status" className="rounded-sm bg-warning/10 px-3 py-2.5 text-[13px] font-medium text-warning">
                This is your own request, so another approver has to decide it.
              </p>
            ) : (
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  className="rounded-sm border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={isPending}
                  onClick={() => decide(false)}
                >
                  Reject
                </Button>
                <Button className="rounded-sm" disabled={isPending || needsLeaveType} onClick={() => decide(true)}>
                  {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  {approveLabel}
                </Button>
              </div>
            )}
          </div>
        </section>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 border bg-card p-10 text-sm text-muted-foreground">
          <Inbox className="size-6" aria-hidden />
          Nothing here. Pick another filter.
        </div>
      )}
    </div>
  );
}
