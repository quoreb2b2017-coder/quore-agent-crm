"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, FilePlus2, FlaskConical, Loader2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormSheet } from "@/components/ui/form-sheet";
import { useActionForm } from "@/hooks/use-action-form";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import { CONTROL_STATUS, MANUAL_CONTROL_STATUSES } from "@/lib/compliance/labels";
import type { ComplianceControlStatus } from "@/types/supabase";
import {
  addEvidence,
  evidenceDownloadUrl,
  recordControlTest,
  requestException,
  saveRisk,
  saveSoaEntry,
  updateControl,
  updateCorrectiveAction,
  type ActionResult,
} from "./actions";

type Person = { id: string; name: string };

function Field({ label, htmlFor, hint, children, wide = false }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "flex flex-col gap-1.5 sm:col-span-2" : "flex flex-col gap-1.5"}>
      <Label htmlFor={htmlFor}>
        {label} {hint ? <span className="font-normal text-muted-foreground">{hint}</span> : null}
      </Label>
      {children}
    </div>
  );
}

function useSheet(action: (fd: FormData) => Promise<ActionResult>, success: string) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useActionForm(action, () => {
    toast.success(success);
    setOpen(false);
    router.refresh();
  });
  return { open, setOpen, ...form };
}

export function EditControlSheet({
  control,
  people,
}: {
  control: {
    id: string;
    status: ComplianceControlStatus;
    owner_employee_id: string | null;
    current_state: string | null;
    gap_remediation: string | null;
    applicability_rationale: string | null;
    next_due_at: string | null;
  };
  people: Person[];
}) {
  const sheet = useSheet(updateControl, "Control updated");
  return (
    <FormSheet
      open={sheet.open}
      onOpenChange={sheet.setOpen}
      trigger={<Button variant="outline"><Pencil className="size-4" /> Edit control</Button>}
      title="Edit control"
      description="Operating needs accepted evidence from the last 12 months and a passing latest test. The database checks this."
      onSubmit={sheet.handleSubmit}
      submitLabel="Save control"
      isPending={sheet.isPending}
      error={sheet.error}
    >
      <input type="hidden" name="id" value={control.id} />
      <Field label="Status" htmlFor="status">
        <select id="status" name="status" defaultValue={control.status} className={NATIVE_SELECT_CLASS}>
          {MANUAL_CONTROL_STATUSES.map((s) => (
            <option key={s} value={s}>{CONTROL_STATUS[s].label}</option>
          ))}
        </select>
      </Field>
      <Field label="Owner" htmlFor="owner">
        <select id="owner" name="owner_employee_id" defaultValue={control.owner_employee_id ?? ""} className={NATIVE_SELECT_CLASS}>
          <option value="">Not assigned</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Next review" htmlFor="next_due_at">
        <Input id="next_due_at" name="next_due_at" type="date" defaultValue={control.next_due_at?.slice(0, 10) ?? ""} />
      </Field>
      <Field label="Current state" htmlFor="current_state" wide>
        <Textarea id="current_state" name="current_state" rows={3} defaultValue={control.current_state ?? ""} />
      </Field>
      <Field label="Gap and remediation" htmlFor="gap_remediation" wide>
        <Textarea id="gap_remediation" name="gap_remediation" rows={3} defaultValue={control.gap_remediation ?? ""} />
      </Field>
      <Field label="Applicability rationale" htmlFor="applicability_rationale" hint="(needed for Not applicable)" wide>
        <Textarea id="applicability_rationale" name="applicability_rationale" rows={2} defaultValue={control.applicability_rationale ?? ""} />
      </Field>
    </FormSheet>
  );
}

export function AddEvidenceSheet({ controlId }: { controlId: string }) {
  const sheet = useSheet(addEvidence, "Evidence added and waiting for review");
  return (
    <FormSheet
      open={sheet.open}
      onOpenChange={sheet.setOpen}
      trigger={<Button><FilePlus2 className="size-4" /> Add evidence</Button>}
      title="Add evidence"
      description="Files are hashed (SHA-256) and stored privately. Evidence cannot be edited once added; add a new item to replace it."
      onSubmit={sheet.handleSubmit}
      submitLabel="Add evidence"
      isPending={sheet.isPending}
      error={sheet.error}
    >
      <input type="hidden" name="control_id" value={controlId} />
      <Field label="Title" htmlFor="ev-title" wide>
        <Input id="ev-title" name="title" required placeholder="e.g. Q3 user access review sign-off" />
      </Field>
      <Field label="Type" htmlFor="ev-type">
        <select id="ev-type" name="evidence_type" className={NATIVE_SELECT_CLASS} defaultValue="DOCUMENT">
          <option value="DOCUMENT">Document</option>
          <option value="SYSTEM_EXPORT">System export</option>
          <option value="SCREENSHOT">Screenshot</option>
          <option value="TICKET">Ticket</option>
          <option value="LOG_EXTRACT">Log extract</option>
          <option value="ATTESTATION">Attestation</option>
        </select>
      </Field>
      <Field label="Source system" htmlFor="ev-source">
        <Input id="ev-source" name="source_system" required placeholder="e.g. Supabase, GitHub, Google Workspace" />
      </Field>
      <Field label="Period start" htmlFor="ev-start">
        <Input id="ev-start" name="period_start" type="date" />
      </Field>
      <Field label="Period end" htmlFor="ev-end">
        <Input id="ev-end" name="period_end" type="date" />
      </Field>
      <Field label="File" htmlFor="ev-file" hint="(up to 25 MB)" wide>
        <Input id="ev-file" name="file" type="file" />
      </Field>
      <Field label="Record ID or link" htmlFor="ev-ref" hint="(if no file)" wide>
        <Input id="ev-ref" name="source_record_id" placeholder="e.g. PR #142, ticket SEC-12" />
      </Field>
      <Field label="Limitations" htmlFor="ev-lim" wide>
        <Textarea id="ev-lim" name="limitations" rows={2} placeholder="Anything the evidence does not show" />
      </Field>
    </FormSheet>
  );
}

export function RecordTestSheet({ controlId, evidence }: { controlId: string; evidence: { id: string; title: string }[] }) {
  const sheet = useSheet(recordControlTest, "Test recorded");
  return (
    <FormSheet
      open={sheet.open}
      onOpenChange={sheet.setOpen}
      trigger={<Button variant="outline"><FlaskConical className="size-4" /> Record test</Button>}
      title="Record a control test"
      description="Tests are append-only. A test by someone other than the control owner is marked independent."
      onSubmit={sheet.handleSubmit}
      submitLabel="Record test"
      isPending={sheet.isPending}
      error={sheet.error}
    >
      <input type="hidden" name="control_id" value={controlId} />
      <Field label="Method" htmlFor="t-method">
        <select id="t-method" name="method" className={NATIVE_SELECT_CLASS} defaultValue="INSPECTION">
          <option value="INSPECTION">Inspection</option>
          <option value="REPERFORMANCE">Re-performance</option>
          <option value="OBSERVATION">Observation</option>
          <option value="INQUIRY">Inquiry</option>
        </select>
      </Field>
      <Field label="Result" htmlFor="t-result">
        <select id="t-result" name="result" className={NATIVE_SELECT_CLASS} defaultValue="PASS">
          <option value="PASS">Pass</option>
          <option value="PARTIAL">Partial</option>
          <option value="FAIL">Fail</option>
        </select>
      </Field>
      <Field label="Population or sample" htmlFor="t-pop" wide>
        <Input id="t-pop" name="population" placeholder="e.g. 25 of 25 joiners in Q3" />
      </Field>
      <Field label="What you tested and found" htmlFor="t-notes" wide>
        <Textarea id="t-notes" name="notes" rows={3} required />
      </Field>
      <Field label="Exceptions" htmlFor="t-exc" hint="(one per line)" wide>
        <Textarea id="t-exc" name="exceptions" rows={3} />
      </Field>
      <Field label="Supporting evidence" htmlFor="t-ev" wide>
        <select id="t-ev" name="evidence_id" className={NATIVE_SELECT_CLASS} defaultValue="">
          <option value="">None</option>
          {evidence.map((e) => (
            <option key={e.id} value={e.id}>{e.title}</option>
          ))}
        </select>
      </Field>
    </FormSheet>
  );
}

export function EvidenceDownloadButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await evidenceDownloadUrl(id);
          if (res.error || !res.url) toast.error(res.error ?? "Could not open the file.");
          else window.open(res.url, "_blank", "noopener");
        })
      }
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
      File
    </Button>
  );
}

export type RiskRow = {
  id: string;
  title: string;
  description: string | null;
  asset: string | null;
  threat: string | null;
  vulnerability: string | null;
  impacts_confidentiality: boolean;
  impacts_integrity: boolean;
  impacts_availability: boolean;
  likelihood: number | null;
  impact: number | null;
  residual_likelihood: number | null;
  residual_impact: number | null;
  treatment: string | null;
  treatment_plan: string | null;
  owner_employee_id: string | null;
  due_date: string | null;
  next_review_date: string | null;
  acceptance_expires_at: string | null;
  status: string;
  control_ids: string[];
};

const SCALE = [1, 2, 3, 4, 5];

export function RiskSheet({ risk, people, controls }: { risk?: RiskRow; people: Person[]; controls: { id: string; label: string }[] }) {
  const sheet = useSheet(saveRisk, risk ? "Risk updated" : "Risk added");
  return (
    <FormSheet
      open={sheet.open}
      onOpenChange={sheet.setOpen}
      trigger={
        risk ? (
          <Button variant="ghost" size="sm"><Pencil className="size-3.5" /> Edit</Button>
        ) : (
          <Button><Plus className="size-4" /> Add risk</Button>
        )
      }
      title={risk ? "Edit risk" : "Add risk"}
      description="Score likelihood and impact from 1 (low) to 5 (high). Accepting a risk needs an expiry date and must be approved by someone other than its owner."
      onSubmit={sheet.handleSubmit}
      submitLabel={risk ? "Save risk" : "Add risk"}
      isPending={sheet.isPending}
      error={sheet.error}
    >
      {risk ? <input type="hidden" name="id" value={risk.id} /> : null}
      <Field label="Title" htmlFor="r-title" wide>
        <Input id="r-title" name="title" required defaultValue={risk?.title ?? ""} />
      </Field>
      <Field label="Asset" htmlFor="r-asset">
        <Input id="r-asset" name="asset" defaultValue={risk?.asset ?? ""} placeholder="e.g. Payroll data" />
      </Field>
      <Field label="Threat" htmlFor="r-threat">
        <Input id="r-threat" name="threat" defaultValue={risk?.threat ?? ""} />
      </Field>
      <Field label="Vulnerability" htmlFor="r-vuln" wide>
        <Input id="r-vuln" name="vulnerability" defaultValue={risk?.vulnerability ?? ""} />
      </Field>
      <fieldset className="flex flex-wrap gap-4 sm:col-span-2">
        <legend className="mb-1.5 text-sm font-medium">Affects</legend>
        {(
          [
            ["impacts_confidentiality", "Confidentiality", risk?.impacts_confidentiality],
            ["impacts_integrity", "Integrity", risk?.impacts_integrity],
            ["impacts_availability", "Availability", risk?.impacts_availability],
          ] as const
        ).map(([name, label, checked]) => (
          <label key={name} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name={name} defaultChecked={Boolean(checked)} className="size-4 accent-[#00775f]" />
            {label}
          </label>
        ))}
      </fieldset>
      {(
        [
          ["likelihood", "Likelihood", risk?.likelihood],
          ["impact", "Impact", risk?.impact],
          ["residual_likelihood", "Residual likelihood", risk?.residual_likelihood],
          ["residual_impact", "Residual impact", risk?.residual_impact],
        ] as const
      ).map(([name, label, value]) => (
        <Field key={name} label={label} htmlFor={`r-${name}`}>
          <select id={`r-${name}`} name={name} defaultValue={value ?? ""} className={NATIVE_SELECT_CLASS}>
            <option value="">Not scored</option>
            {SCALE.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </Field>
      ))}
      <Field label="Treatment" htmlFor="r-treat">
        <select id="r-treat" name="treatment" defaultValue={risk?.treatment ?? ""} className={NATIVE_SELECT_CLASS}>
          <option value="">Not decided</option>
          <option value="MITIGATE">Mitigate</option>
          <option value="AVOID">Avoid</option>
          <option value="TRANSFER">Transfer</option>
          <option value="ACCEPT">Accept</option>
        </select>
      </Field>
      <Field label="Status" htmlFor="r-status">
        <select id="r-status" name="status" defaultValue={risk?.status ?? "IDENTIFIED"} className={NATIVE_SELECT_CLASS}>
          <option value="IDENTIFIED">Identified</option>
          <option value="ASSESSED">Assessed</option>
          <option value="TREATMENT_IN_PROGRESS">Treatment in progress</option>
          <option value="TREATED">Treated</option>
          <option value="ACCEPTED">Accepted</option>
          <option value="CLOSED">Closed</option>
        </select>
      </Field>
      <Field label="Owner" htmlFor="r-owner">
        <select id="r-owner" name="owner_employee_id" defaultValue={risk?.owner_employee_id ?? ""} className={NATIVE_SELECT_CLASS}>
          <option value="">Not assigned</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Treatment due" htmlFor="r-due">
        <Input id="r-due" name="due_date" type="date" defaultValue={risk?.due_date ?? ""} />
      </Field>
      <Field label="Next review" htmlFor="r-review">
        <Input id="r-review" name="next_review_date" type="date" defaultValue={risk?.next_review_date ?? ""} />
      </Field>
      <Field label="Acceptance expires" htmlFor="r-exp" hint="(if accepted)">
        <Input id="r-exp" name="acceptance_expires_at" type="date" defaultValue={risk?.acceptance_expires_at ?? ""} />
      </Field>
      <Field label="Treatment plan" htmlFor="r-plan" wide>
        <Textarea id="r-plan" name="treatment_plan" rows={3} defaultValue={risk?.treatment_plan ?? ""} />
      </Field>
      <Field label="Linked controls" htmlFor="r-controls" hint="(Ctrl/⌘-click to pick several)" wide>
        <select id="r-controls" name="control_ids" multiple defaultValue={risk?.control_ids ?? []} className="min-h-32 rounded-md border bg-card p-1.5 text-sm">
          {controls.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </Field>
    </FormSheet>
  );
}

export function SoaRowForm({
  entry,
}: {
  entry: { id: string; applicable: boolean | null; justification: string | null; implementation_status: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dirty, setDirty] = useState(false);
  return (
    <form
      onChange={() => setDirty(true)}
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        start(async () => {
          const res = await saveSoaEntry(formData);
          if (res.error) toast.error(res.error);
          else {
            toast.success("Saved");
            setDirty(false);
            router.refresh();
          }
        });
      }}
      className="grid gap-2 md:grid-cols-[140px_minmax(0,1fr)_160px_auto] md:items-start"
    >
      <input type="hidden" name="id" value={entry.id} />
      <select
        name="applicable"
        aria-label="Applicable"
        defaultValue={entry.applicable === null ? "" : entry.applicable ? "yes" : "no"}
        className={`${NATIVE_SELECT_CLASS} h-9`}
      >
        <option value="">Not decided</option>
        <option value="yes">Applicable</option>
        <option value="no">Excluded</option>
      </select>
      <Textarea name="justification" aria-label="Justification" rows={1} defaultValue={entry.justification ?? ""} placeholder="Why it applies or is excluded" className="min-h-9 py-1.5" />
      <select name="implementation_status" aria-label="Implementation" defaultValue={entry.implementation_status} className={`${NATIVE_SELECT_CLASS} h-9`}>
        <option value="NOT_ASSESSED">Not assessed</option>
        <option value="NOT_IMPLEMENTED">Not implemented</option>
        <option value="PARTIAL">Partial</option>
        <option value="IMPLEMENTED">Implemented</option>
      </select>
      <Button type="submit" variant={dirty ? "default" : "outline"} size="sm" className="h-9" disabled={pending || !dirty}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
        Save
      </Button>
    </form>
  );
}

export function ActionSheet({
  action,
  people,
  evidence,
}: {
  action: { id: string; ref: string; title: string; status: string; owner_employee_id: string | null; due_date: string | null; closure_evidence_id: string | null };
  people: Person[];
  evidence: { id: string; title: string }[];
}) {
  const sheet = useSheet(updateCorrectiveAction, "Corrective action updated");
  return (
    <FormSheet
      open={sheet.open}
      onOpenChange={sheet.setOpen}
      trigger={<Button variant="ghost" size="sm"><Pencil className="size-3.5" /> Update</Button>}
      title={`${action.ref} · ${action.title}`}
      description="Closing needs accepted evidence of the fix, and must be done by someone other than the owner."
      onSubmit={sheet.handleSubmit}
      submitLabel="Save"
      isPending={sheet.isPending}
      error={sheet.error}
    >
      <input type="hidden" name="id" value={action.id} />
      <Field label="Status" htmlFor="a-status">
        <select id="a-status" name="status" defaultValue={action.status} className={NATIVE_SELECT_CLASS}>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="READY_FOR_VERIFICATION">Ready to verify</option>
          <option value="CLOSED">Closed</option>
        </select>
      </Field>
      <Field label="Owner" htmlFor="a-owner">
        <select id="a-owner" name="owner_employee_id" defaultValue={action.owner_employee_id ?? ""} className={NATIVE_SELECT_CLASS}>
          <option value="">Not assigned</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Due date" htmlFor="a-due">
        <Input id="a-due" name="due_date" type="date" defaultValue={action.due_date ?? ""} />
      </Field>
      <Field label="Closure evidence" htmlFor="a-ev" hint="(accepted only)" wide>
        <select id="a-ev" name="closure_evidence_id" defaultValue={action.closure_evidence_id ?? ""} className={NATIVE_SELECT_CLASS}>
          <option value="">None yet</option>
          {evidence.map((e) => (
            <option key={e.id} value={e.id}>{e.title}</option>
          ))}
        </select>
      </Field>
    </FormSheet>
  );
}

export function RequestExceptionSheet({ controls }: { controls: { id: string; label: string }[] }) {
  const sheet = useSheet(requestException, "Exception requested. Another approver must decide it.");
  return (
    <FormSheet
      open={sheet.open}
      onOpenChange={sheet.setOpen}
      trigger={<Button><Plus className="size-4" /> Request exception</Button>}
      title="Request a security exception"
      description="Use this when a control cannot be met for now. It needs a compensating control, an expiry date and approval by someone else."
      onSubmit={sheet.handleSubmit}
      submitLabel="Request exception"
      isPending={sheet.isPending}
      error={sheet.error}
    >
      <Field label="Type" htmlFor="x-kind">
        <select id="x-kind" name="kind" className={NATIVE_SELECT_CLASS} defaultValue="SEGREGATION_OF_DUTIES">
          <option value="SEGREGATION_OF_DUTIES">Separation of duties</option>
          <option value="POLICY">Policy</option>
          <option value="CONTROL_FAILURE">Control failure</option>
          <option value="TECHNICAL">Technical</option>
        </select>
      </Field>
      <Field label="Expires" htmlFor="x-exp">
        <Input id="x-exp" name="expires_at" type="date" required />
      </Field>
      <Field label="Control" htmlFor="x-control" wide>
        <select id="x-control" name="control_id" className={NATIVE_SELECT_CLASS} defaultValue="">
          <option value="">Not linked to a control</option>
          {controls.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </Field>
      <Field label="What cannot be met, and why" htmlFor="x-desc" wide>
        <Textarea id="x-desc" name="description" rows={3} required />
      </Field>
      <Field label="Compensating control" htmlFor="x-comp" wide>
        <Textarea id="x-comp" name="compensating_control" rows={2} required placeholder="e.g. Weekly review of payroll changes by the CEO" />
      </Field>
    </FormSheet>
  );
}
