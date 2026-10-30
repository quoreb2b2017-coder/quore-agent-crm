"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Inbox, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { acceptMeeting, rejectMeeting } from "@/lib/actions/attendance";
import { reviewLeaveRequest } from "@/lib/actions/leave";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ApprovalItem, ApprovalKind } from "@/lib/queries/approvals";
import { decideException, reviewEvidence } from "./actions";

const KIND_META: Record<ApprovalKind, { label: string; tone: string }> = {
  MEETING: { label: "Meeting", tone: "info" },
  LEAVE: { label: "Leave", tone: "warning" },
  EVIDENCE: { label: "Evidence", tone: "brand" },
  EXCEPTION: { label: "Exception", tone: "danger" },
};

const TABS: { key: ApprovalKind | "ALL"; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "MEETING", label: "Meetings" },
  { key: "LEAVE", label: "Leave" },
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
  const chosenLeaveType = leaveType || selected?.leaveTypeId || "";

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
      case "EVIDENCE":
        return run(() => reviewEvidence(selected.id, approve ? "ACCEPTED" : "REJECTED", note), approve ? "Evidence accepted" : "Evidence rejected");
      case "EXCEPTION":
        return run(() => decideException(selected.id, approve ? "APPROVED" : "REJECTED"), approve ? "Exception approved" : "Exception rejected");
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card px-6 py-16 text-center">
        <CheckCircle2 className="size-8 text-success" aria-hidden />
        <p className="text-base font-semibold">You are all caught up</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Meeting requests, leave requests, evidence reviews and security exceptions will appear here when they need you.
        </p>
      </div>
    );
  }

  const approveLabel =
    selected?.kind === "MEETING" ? "Accept" : selected?.kind === "EVIDENCE" ? "Accept evidence" : "Approve";

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Filter approvals" className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            disabled={t.key !== "ALL" && counts[t.key] === 0}
            className={cn(
              "h-8 rounded-full border px-3.5 text-[13px] font-medium transition disabled:opacity-40",
              tab === t.key ? "border-ink bg-ink text-white" : "bg-card text-foreground/80 hover:bg-muted"
            )}
          >
            {t.label} <span className="opacity-70">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <ul aria-label="Requests" className="overflow-hidden rounded-xl border bg-card">
          {visible.map((item) => {
            const active = selected?.id === item.id;
            return (
              <li key={item.id} className="border-b last:border-b-0">
                <button
                  type="button"
                  onClick={() => select(item.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex w-full items-start gap-3 border-l-[3px] px-4 py-3.5 text-left transition",
                    active ? "border-l-[#00a67e] bg-[#f3fbf8]" : "border-l-transparent hover:bg-muted/50"
                  )}
                >
                  <span className="wt-pill mt-0.5 min-w-[78px] justify-center text-[11px] tracking-wide uppercase" data-tone={KIND_META[item.kind].tone}>
                    {KIND_META[item.kind].label}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    <span className="block truncate text-[12.5px] text-muted-foreground">{item.subtitle}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(item.requestedAt)}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {selected ? (
          <section aria-label="Request detail" className="flex flex-col rounded-xl border bg-card lg:sticky lg:top-0 lg:self-start">
            <div className="flex flex-col gap-1.5 border-b px-5 py-4">
              <span className="wt-pill self-start text-[11px] tracking-wide uppercase" data-tone={KIND_META[selected.kind].tone}>
                {KIND_META[selected.kind].label}
              </span>
              <h2 className="text-lg font-semibold">{selected.title}</h2>
              <p className="text-sm text-muted-foreground">{selected.subtitle}</p>
            </div>
            <dl className="grid grid-cols-[140px_minmax(0,1fr)] gap-x-4 gap-y-2.5 border-b px-5 py-4 text-sm">
              {selected.details.map((d) => (
                <div key={d.label} className="contents">
                  <dt className="text-muted-foreground">{d.label}</dt>
                  <dd className="font-medium break-words">
                    {/^\d{4}-\d{2}-\d{2}T/.test(d.value) ? formatDateTime(d.value) : d.value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-col gap-3 px-5 py-4">
              <div className="flex gap-2.5 rounded-lg border bg-muted/40 p-3 text-[12.5px] leading-relaxed text-foreground/80">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span>{selected.rule}</span>
              </div>

              {selected.kind === "LEAVE" ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="leave-type">Approve as</Label>
                  <select
                    id="leave-type"
                    className={NATIVE_SELECT_CLASS}
                    value={chosenLeaveType}
                    onChange={(event) => setLeaveType(event.target.value)}
                  >
                    {leaveTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name} {type.is_paid ? "(paid)" : "(unpaid)"}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {selected.kind === "EVIDENCE" ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="review-note">
                    Review note <span className="font-normal text-muted-foreground">(required to reject)</span>
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
                <p role="status" className="rounded-lg bg-[#fffaeb] px-3 py-2.5 text-[13px] text-[#93370d]">
                  This is your own request, so another approver has to decide it.
                </p>
              ) : (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    className="border-[#fecdca] text-destructive hover:bg-[#fef3f2] hover:text-destructive"
                    disabled={isPending}
                    onClick={() => decide(false)}
                  >
                    Reject
                  </Button>
                  <Button className="bg-ink text-white hover:bg-ink/90" disabled={isPending} onClick={() => decide(true)}>
                    {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                    {approveLabel}
                  </Button>
                </div>
              )}
            </div>
          </section>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card p-10 text-sm text-muted-foreground">
            <Inbox className="size-6" aria-hidden />
            Select a request to see the details.
          </div>
        )}
      </div>
    </div>
  );
}
