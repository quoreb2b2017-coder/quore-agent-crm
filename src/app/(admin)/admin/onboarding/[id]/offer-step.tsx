"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Download,
  ExternalLink,
  FileSignature,
  Loader2,
  Send,
  Sparkles,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatInr } from "@/lib/format";
import {
  CTC_PRESETS,
  DEPARTMENT_CHOICES,
  DESIGNATION_GROUPS,
  NOTICE_CHOICES,
  OFFER_VALIDITY_DAYS,
  PROBATION_CHOICES,
  WORKING_DAYS_CHOICES,
  WORK_LOCATION_CHOICES,
  type OfferDetails,
} from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { saveOffer, setOfferStage, type ActionState } from "../actions";
import { ChoiceField, type Choice } from "./choice-field";
import { Field, SectionTitle, StepFooter, StepPanel, selectClass } from "./step-ui";

const initialState: ActionState = {};

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function lakhLabel(amount: number) {
  const lakhs = amount / 100000;
  return `₹${Number.isInteger(lakhs) ? lakhs : lakhs.toFixed(1)}L`;
}

function Stage({
  label,
  at,
  active,
  last,
}: {
  label: string;
  at: string | null;
  active: boolean;
  last?: boolean;
}) {
  return (
    <div className="flex flex-1 items-center gap-2">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
            at ? "border-success bg-success text-white" : active ? "border-primary text-primary" : "text-muted-foreground"
          )}
        >
          {at ? <Check className="size-3.5" /> : null}
        </span>
        <div className="leading-tight">
          <p className={cn("text-xs font-medium", !at && !active && "text-muted-foreground")}>{label}</p>
          <p className="text-[11px] text-muted-foreground">{at ? formatDate(at) : "—"}</p>
        </div>
      </div>
      {!last ? (
        <div className={cn("mx-1 h-px flex-1", at ? "bg-success/50" : "bg-border")} />
      ) : null}
    </div>
  );
}

export function OfferStep({
  employeeId,
  fullName,
  offer,
  joiningDate,
  today,
  defaultDepartment,
  defaultLocation,
  reportingChoices,
  signedCopyUploaded,
  offerColumnMissing,
  done,
}: {
  employeeId: string;
  fullName: string;
  offer: OfferDetails;
  joiningDate: string;
  today: string;
  defaultDepartment: string;
  defaultLocation: string;
  reportingChoices: Choice[];
  signedCopyUploaded: boolean;
  offerColumnMissing: boolean;
  done: boolean;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(saveOffer.bind(null, employeeId), initialState);
  const [stagePending, startStage] = useTransition();
  const [ctc, setCtc] = useState(offer.annualCtc ? String(offer.annualCtc) : "");
  const [designation, setDesignation] = useState(offer.designation);
  const generated = Boolean(offer.generatedAt);

  useEffect(() => {
    if (state.success) {
      toast.success("Offer letter is ready");
      router.refresh();
    }
  }, [state, router]);

  const ctcNumber = Number(ctc.replace(/[,\s]/g, ""));
  const monthly = Number.isFinite(ctcNumber) && ctcNumber > 0 ? ctcNumber / 12 : null;
  const locationChoices = WORK_LOCATION_CHOICES.includes(defaultLocation)
    ? WORK_LOCATION_CHOICES
    : [defaultLocation, ...WORK_LOCATION_CHOICES];
  const validityChoices = OFFER_VALIDITY_DAYS.map((days) => {
    const value = addDays(today, days);
    return { value, label: `${days} days · until ${formatDate(value)}` };
  });
  const pdfUrl = `/api/onboarding/offer-letter?employee=${employeeId}`;

  function stage(next: "sent" | "accepted", value: boolean) {
    startStage(async () => {
      const result = await setOfferStage(employeeId, next, value);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        value ? (next === "sent" ? "Marked as sent" : "Offer accepted") : "Updated"
      );
      router.refresh();
    });
  }

  return (
    <StepPanel
      title="Offer letter"
      description="Fill the offer, generate the letter, send it and record when the candidate accepts."
      done={done}
      doneLabel="Offer accepted"
      pendingLabel={offer.sentAt ? "Waiting for acceptance" : generated ? "Ready to send" : "Not generated"}
    >
      <div className="grid gap-6">
        {offerColumnMissing ? (
          <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
            Run <code className="text-xs">supabase/migrations/0023_onboarding_offer.sql</code> in the Supabase SQL
            Editor once to save offer letters.
          </p>
        ) : null}

        <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4 sm:flex-row sm:items-center">
          <Stage label="Generated" at={offer.generatedAt} active={!generated} />
          <Stage label="Sent to candidate" at={offer.sentAt} active={generated && !offer.sentAt} />
          <Stage
            label="Accepted"
            at={offer.acceptedAt}
            active={Boolean(offer.sentAt) && !offer.acceptedAt}
            last
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <form action={formAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SectionTitle hint="Pick from the list, or choose “Other” to type your own.">Role</SectionTitle>
            <Field id="designation" label="Designation" required>
              <ChoiceField
                id="designation"
                name="designation"
                groups={DESIGNATION_GROUPS}
                defaultValue={offer.designation}
                placeholder="Select designation"
                otherPlaceholder="e.g. Senior Sales Executive"
                onValueChange={setDesignation}
                required
              />
            </Field>
            <Field id="department" label="Department">
              <ChoiceField
                id="department"
                name="department"
                options={DEPARTMENT_CHOICES}
                defaultValue={offer.department || defaultDepartment}
                placeholder="Select department"
              />
            </Field>
            <Field id="reportingTo" label="Reporting to">
              <ChoiceField
                id="reportingTo"
                name="reportingTo"
                options={reportingChoices}
                defaultValue={offer.reportingTo}
                placeholder="Select manager"
                otherPlaceholder="Manager name"
              />
            </Field>
            <Field id="workLocation" label="Work location" required>
              <ChoiceField
                id="workLocation"
                name="workLocation"
                options={locationChoices}
                defaultValue={offer.workLocation || defaultLocation}
                placeholder="Select location"
                otherPlaceholder="e.g. Mumbai (Office)"
                required
              />
            </Field>

            <SectionTitle>Pay & terms</SectionTitle>
            <Field
              id="annualCtc"
              label="Annual CTC (₹)"
              required
              hint={monthly ? `≈ ${formatInr(monthly)} per month` : "Type an amount or pick a quick option"}
              className="sm:col-span-full"
            >
              <div className="grid gap-2 sm:grid-cols-[minmax(0,220px)_1fr] sm:items-center">
                <Input
                  id="annualCtc"
                  name="annualCtc"
                  inputMode="numeric"
                  placeholder="e.g. 300000"
                  value={ctc}
                  onChange={(event) => setCtc(event.target.value)}
                  required
                />
                <div className="flex flex-wrap gap-1.5">
                  {CTC_PRESETS.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setCtc(String(amount))}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:border-primary/50 hover:bg-primary/5",
                        ctcNumber === amount && "border-primary bg-primary/10 text-primary"
                      )}
                    >
                      {lakhLabel(amount)}
                    </button>
                  ))}
                </div>
              </div>
            </Field>
            <Field id="joiningDate" label="Joining date" required>
              <Input id="joiningDate" name="joiningDate" type="date" defaultValue={joiningDate} required />
            </Field>
            <Field id="workingDays" label="Working days">
              <ChoiceField
                id="workingDays"
                name="workingDays"
                options={WORKING_DAYS_CHOICES}
                defaultValue={offer.workingDays}
                placeholder="Select working days"
              />
            </Field>
            <Field id="probationMonths" label="Probation">
              <select
                id="probationMonths"
                name="probationMonths"
                defaultValue={String(offer.probationMonths)}
                className={selectClass}
              >
                {PROBATION_CHOICES.map((months) => (
                  <option key={months} value={months}>
                    {months === 0 ? "No probation" : `${months} month${months > 1 ? "s" : ""}`}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="noticeDays" label="Notice period">
              <select
                id="noticeDays"
                name="noticeDays"
                defaultValue={String(offer.noticeDays)}
                className={selectClass}
              >
                {NOTICE_CHOICES.map((days) => (
                  <option key={days} value={days}>
                    {days} days
                  </option>
                ))}
              </select>
            </Field>
            <Field id="validUntil" label="Offer valid for" required>
              <select
                id="validUntil"
                name="validUntil"
                defaultValue={offer.validUntil || addDays(today, 7)}
                className={selectClass}
                required
              >
                {offer.validUntil && !validityChoices.some((choice) => choice.value === offer.validUntil) ? (
                  <option value={offer.validUntil}>Until {formatDate(offer.validUntil)} (current)</option>
                ) : null}
                {validityChoices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </Field>

            {state.error ? (
              <p className="text-sm text-destructive sm:col-span-full">{state.error}</p>
            ) : null}
            <div className="sm:col-span-full">
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {generated ? "Update offer letter" : "Generate offer letter"}
              </Button>
            </div>
          </form>

          <aside className="flex flex-col gap-3">
            <div className="relative overflow-hidden rounded-xl border bg-card shadow-sm">
              <div className="h-1.5 bg-primary" />
              <div className="space-y-3 p-4">
                <div className="flex items-center gap-2 text-primary">
                  <FileSignature className="size-4" />
                  <span className="text-[11px] font-semibold tracking-wide uppercase">Offer of employment</span>
                </div>
                <div>
                  <p className="text-sm font-semibold">{fullName}</p>
                  <p className="text-xs text-muted-foreground">{designation || "Designation"}</p>
                </div>
                <dl className="space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Annual CTC</dt>
                    <dd className="font-medium tabular-nums">{ctcNumber > 0 ? formatInr(ctcNumber) : "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Joining</dt>
                    <dd className="font-medium">{formatDate(joiningDate)}</dd>
                  </div>
                  {offer.letterNumber ? (
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Ref</dt>
                      <dd className="font-mono text-[11px]">{offer.letterNumber}</dd>
                    </div>
                  ) : null}
                </dl>
                <div className="space-y-1 pt-1">
                  <div className="h-1.5 w-full rounded bg-muted" />
                  <div className="h-1.5 w-5/6 rounded bg-muted" />
                  <div className="h-1.5 w-4/6 rounded bg-muted" />
                </div>
              </div>
            </div>

            {generated ? (
              <div className="grid gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={pdfUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="size-3.5" />
                      Preview
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href={`${pdfUrl}&download=1`}>
                      <Download className="size-3.5" />
                      Download
                    </a>
                  </Button>
                </div>
                {!offer.sentAt ? (
                  <Button size="sm" disabled={stagePending} onClick={() => stage("sent", true)}>
                    {stagePending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                    Mark as sent
                  </Button>
                ) : !offer.acceptedAt ? (
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Button size="sm" disabled={stagePending} onClick={() => stage("accepted", true)}>
                      {stagePending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Check className="size-3.5" />
                      )}
                      Candidate accepted
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Undo sent"
                      disabled={stagePending}
                      onClick={() => stage("sent", false)}
                    >
                      <Undo2 className="size-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" disabled={stagePending} onClick={() => stage("accepted", false)}>
                    <Undo2 className="size-3.5" />
                    Undo acceptance
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  {signedCopyUploaded
                    ? "Signed copy is uploaded in Documents."
                    : "Tip: upload the signed copy in Documents as “Signed offer letter”."}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Fill the details and click Generate. The PDF uses your company letterhead.
              </p>
            )}
          </aside>
        </div>

        <StepFooter employeeId={employeeId} current="offer" />
      </div>
    </StepPanel>
  );
}
