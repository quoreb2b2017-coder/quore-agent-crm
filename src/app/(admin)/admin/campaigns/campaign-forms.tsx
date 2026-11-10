"use client";

import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, Check, Loader2, Pause, Pencil, Play, Send, Upload, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormSheet } from "@/components/ui/form-sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useActionForm } from "@/hooks/use-action-form";
import { createClient } from "@/lib/supabase/client";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import { MAX_UPLOAD_BYTES, MEMBER_ROLE, REQUIRED_FIELD_OPTIONS, formatBytes } from "@/lib/campaigns/labels";
import type { CampaignMemberRole } from "@/types/supabase";
import {
  addCampaignMember,
  archiveCampaignFile,
  changeCampaignStatus,
  completeUpload,
  createCampaign,
  decideDatabaseVersion,
  endCampaignMember,
  requestUpload,
  updateCampaign,
} from "./actions";

type Person = { id: string; name: string };

function Field({ label, htmlFor, hint, children, wide = false }: { label: string; htmlFor: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "flex flex-col gap-1.5 sm:col-span-2" : "flex flex-col gap-1.5"}>
      <Label htmlFor={htmlFor}>
        {label} {hint ? <span className="font-normal text-muted-foreground">{hint}</span> : null}
      </Label>
      {children}
    </div>
  );
}

export type CampaignFormValues = {
  id?: string;
  name: string;
  client_name: string | null;
  advertiser: string | null;
  description: string | null;
  instructions: string | null;
  geography: string[];
  industries: string[];
  job_titles: string[];
  starts_on: string | null;
  ends_on: string | null;
  manager_id: string | null;
  required_fields: string[];
};

function CampaignFields({ values, people }: { values?: CampaignFormValues; people: Person[] }) {
  const required = new Set(values?.required_fields ?? ["full_name", "company"]);
  return (
    <>
      {values?.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <Field label="Campaign name" htmlFor="co-name" wide>
        <Input id="co-name" name="name" required minLength={2} maxLength={160} defaultValue={values?.name ?? ""} placeholder="NetApp AI Infrastructure" />
      </Field>
      <Field label="Client" htmlFor="co-client">
        <Input id="co-client" name="client_name" maxLength={160} defaultValue={values?.client_name ?? ""} />
      </Field>
      <Field label="Advertiser" htmlFor="co-advertiser" hint="if different">
        <Input id="co-advertiser" name="advertiser" maxLength={160} defaultValue={values?.advertiser ?? ""} />
      </Field>
      <Field label="Start date" htmlFor="co-start">
        <Input id="co-start" name="starts_on" type="date" defaultValue={values?.starts_on ?? ""} />
      </Field>
      <Field label="End date" htmlFor="co-end">
        <Input id="co-end" name="ends_on" type="date" defaultValue={values?.ends_on ?? ""} />
      </Field>
      <Field label="Campaign manager" htmlFor="co-manager" wide>
        <select id="co-manager" name="manager_id" defaultValue={values?.manager_id ?? ""} className={NATIVE_SELECT_CLASS}>
          <option value="">Not assigned yet</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Target geography" htmlFor="co-geo" hint="comma-separated">
        <Input id="co-geo" name="geography" defaultValue={values?.geography.join(", ") ?? ""} placeholder="US, UK" />
      </Field>
      <Field label="Target industries" htmlFor="co-ind" hint="comma-separated">
        <Input id="co-ind" name="industries" defaultValue={values?.industries.join(", ") ?? ""} placeholder="Manufacturing, Healthcare" />
      </Field>
      <Field label="Target job titles" htmlFor="co-titles" hint="comma-separated" wide>
        <Input id="co-titles" name="job_titles" defaultValue={values?.job_titles.join(", ") ?? ""} placeholder="CIO, VP Infrastructure, IT Director" />
      </Field>
      <Field label="Description" htmlFor="co-desc" wide>
        <Textarea id="co-desc" name="description" rows={3} maxLength={4000} defaultValue={values?.description ?? ""} />
      </Field>
      <Field label="Instructions for the team" htmlFor="co-instr" hint="shown to every member" wide>
        <Textarea id="co-instr" name="instructions" rows={4} maxLength={8000} defaultValue={values?.instructions ?? ""} />
      </Field>
      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="mb-1 text-sm font-medium">Every database row must have</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {REQUIRED_FIELD_OPTIONS.map((option) => (
            <label key={option.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="required_fields" value={option.key} defaultChecked={required.has(option.key)} className="size-4" />
              {option.label}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">An email or a phone number is always required, and both are format-checked.</p>
      </fieldset>
    </>
  );
}

export function NewCampaignForm({ people }: { people: Person[] }) {
  const router = useRouter();
  const form = useActionForm(createCampaign, (result) => {
    toast.success("Campaign created");
    router.push(`/admin/campaigns/${result.id}`);
  });
  return (
    <form onSubmit={form.handleSubmit} className="grid grid-cols-1 gap-x-4 gap-y-4 px-5 py-5 sm:grid-cols-2">
      <CampaignFields people={people} />
      {form.error ? <p className="text-sm text-destructive sm:col-span-2" role="alert">{form.error}</p> : null}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={form.isPending}>
          {form.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Create campaign
        </Button>
      </div>
    </form>
  );
}

export function EditCampaignSheet({ values, people }: { values: CampaignFormValues; people: Person[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useActionForm(updateCampaign, () => {
    toast.success("Campaign saved");
    setOpen(false);
    router.refresh();
  });
  return (
    <FormSheet
      open={open}
      onOpenChange={setOpen}
      trigger={<Button variant="outline"><Pencil className="size-4" /> Edit</Button>}
      title="Edit campaign"
      description="Changes are recorded in the audit log with your name."
      onSubmit={form.handleSubmit}
      submitLabel="Save campaign"
      isPending={form.isPending}
      error={form.error}
    >
      <CampaignFields values={values} people={people} />
    </FormSheet>
  );
}

/** A button that asks for a reason (or just confirmation) before running an action. */
function ReasonDialog({
  trigger,
  title,
  description,
  confirmLabel,
  needsReason,
  destructive,
  run,
  success,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  needsReason: boolean;
  destructive?: boolean;
  run: (reason: string) => Promise<{ error?: string }>;
  success: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    start(async () => {
      const result = await run(reason);
      if (result.error) setError(result.error);
      else {
        toast.success(success);
        setOpen(false);
        setReason("");
        setError(undefined);
        router.refresh();
      }
    });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {needsReason ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reason">Reason</Label>
              <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} required minLength={3} />
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null} {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CampaignStatusActions({ campaignId, status }: { campaignId: string; status: string }) {
  const preProduction = ["DRAFT", "AWAITING_DATABASE", "DATABASE_VALIDATION", "AWAITING_APPROVAL", "READY_FOR_DISTRIBUTION"];
  return (
    <>
      {status === "DRAFT" ? (
        <ReasonDialog
          trigger={<Button variant="outline"><Send className="size-4" /> Ready for database</Button>}
          title="Mark ready for its database?"
          description="The database team sees the campaign as waiting for a database upload."
          confirmLabel="Mark ready"
          needsReason={false}
          run={(reason) => changeCampaignStatus(campaignId, "submit", reason)}
          success="Campaign is waiting for its database"
        />
      ) : null}
      {status === "ON_HOLD" ? (
        <ReasonDialog
          trigger={<Button variant="outline"><Play className="size-4" /> Resume</Button>}
          title="Resume this campaign?"
          description="It returns to the status it had before it was put on hold."
          confirmLabel="Resume"
          needsReason={false}
          run={(reason) => changeCampaignStatus(campaignId, "resume", reason)}
          success="Campaign resumed"
        />
      ) : status !== "ARCHIVED" && status !== "COMPLETED" ? (
        <ReasonDialog
          trigger={<Button variant="outline"><Pause className="size-4" /> Put on hold</Button>}
          title="Put this campaign on hold?"
          description="Uploads and new work stop until it is resumed. The reason goes into the audit log."
          confirmLabel="Put on hold"
          needsReason
          run={(reason) => changeCampaignStatus(campaignId, "hold", reason)}
          success="Campaign on hold"
        />
      ) : null}
      {[...preProduction, "COMPLETED", "ON_HOLD"].includes(status) ? (
        <ReasonDialog
          trigger={<Button variant="outline"><Archive className="size-4" /> Archive</Button>}
          title="Archive this campaign?"
          description="It becomes read-only. Nothing is deleted: files, versions and history stay available to managers and auditors."
          confirmLabel="Archive campaign"
          needsReason
          destructive
          run={(reason) => changeCampaignStatus(campaignId, "archive", reason)}
          success="Campaign archived"
        />
      ) : null}
    </>
  );
}

export function AddMemberSheet({ campaignId, people }: { campaignId: string; people: Person[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useActionForm(addCampaignMember, () => {
    toast.success("Member added");
    setOpen(false);
    router.refresh();
  });
  return (
    <FormSheet
      open={open}
      onOpenChange={setOpen}
      trigger={<Button variant="outline" size="sm"><UserPlus className="size-4" /> Add member</Button>}
      title="Add a campaign member"
      description="Members see this campaign. What they can open depends on their campaign role and their WorkTrack role."
      onSubmit={form.handleSubmit}
      submitLabel="Add member"
      isPending={form.isPending}
      error={form.error}
    >
      <input type="hidden" name="campaign_id" value={campaignId} />
      <Field label="Person" htmlFor="m-person" wide>
        <select id="m-person" name="employee_id" required defaultValue="" className={NATIVE_SELECT_CLASS}>
          <option value="" disabled>Pick an active employee</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </Field>
      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="mb-1 text-sm font-medium">Campaign role</legend>
        {(Object.keys(MEMBER_ROLE) as CampaignMemberRole[]).map((role) => (
          <label key={role} className="flex items-start gap-2 text-sm">
            <input type="radio" name="member_role" value={role} required defaultChecked={role === "DATABASE"} className="mt-0.5 size-4" />
            <span>
              {MEMBER_ROLE[role].label}
              <span className="block text-xs text-muted-foreground">{MEMBER_ROLE[role].hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </FormSheet>
  );
}

export function EndMemberButton({ memberId, name }: { memberId: string; name: string }) {
  return (
    <ReasonDialog
      trigger={<Button variant="ghost" size="sm" aria-label={`Remove ${name}`}><X className="size-4" /></Button>}
      title={`Remove ${name} from this campaign?`}
      description="They lose access to it on their next click. Their past uploads and history keep their name."
      confirmLabel="Remove"
      needsReason={false}
      destructive
      run={() => endCampaignMember(memberId)}
      success="Member removed"
    />
  );
}

type Category = { key: string; label: string; is_database: boolean };

export function UploadSheet({
  campaignId,
  categories,
  label,
}: {
  campaignId: string;
  categories: Category[];
  label: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [stage, setStage] = useState<"idle" | "preparing" | "uploading" | "finishing">("idle");
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = stage !== "idle";
  const onlyDatabase = categories.every((c) => c.is_database);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Choose a file.");
    if (file.size > MAX_UPLOAD_BYTES) return setError(`This file is ${formatBytes(file.size)}. The limit is 100 MB.`);
    setError(undefined);
    setStage("preparing");
    try {
      const ticket = await requestUpload({
        campaignId,
        categoryKey: String(formData.get("category_key")),
        title: String(formData.get("title") ?? ""),
        fileName: file.name,
        size: file.size,
        mimeType: file.type,
      });
      if (ticket.error || !ticket.path || !ticket.token || !ticket.fileId) throw new Error(ticket.error ?? "Upload could not start.");
      setStage("uploading");
      const { error: uploadError } = await createClient().storage.from("co-quarantine").uploadToSignedUrl(ticket.path, ticket.token, file, {
        contentType: file.type || "application/octet-stream",
      });
      if (uploadError) throw new Error("The file did not upload. Check your connection and try again.");
      setStage("finishing");
      const done = await completeUpload(ticket.fileId);
      if (done.error) throw new Error(done.error);
      toast.success("Uploaded. It is in quarantine until the malware scan and checks finish.");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setStage("idle");
    }
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={(next) => !busy && setOpen(next)}
      trigger={<Button size="sm"><Upload className="size-4" /> {label}</Button>}
      title={label}
      description={
        onlyDatabase
          ? "CSV or XLSX, up to 100 MB. It goes to quarantine, is scanned for malware, then every row is validated. Someone other than you approves it before it is published."
          : "It goes to quarantine and is scanned for malware. Campaign members can open it once it passes."
      }
      onSubmit={submit}
      submitLabel={stage === "uploading" ? "Uploading…" : stage === "finishing" ? "Finishing…" : "Upload"}
      isPending={busy}
      error={error}
    >
      <Field label="File type" htmlFor="u-category" wide>
        <select id="u-category" name="category_key" required className={NATIVE_SELECT_CLASS} defaultValue={categories[0]?.key}>
          {categories.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Title" htmlFor="u-title" hint="optional; same title = new version" wide>
        <Input id="u-title" name="title" maxLength={200} placeholder="Uses the file name if empty" />
      </Field>
      <Field label="File" htmlFor="u-file" wide>
        <Input
          id="u-file"
          ref={fileRef}
          type="file"
          required
          accept={onlyDatabase ? ".csv,.xlsx" : ".pdf,.docx,.doc,.txt,.pptx,.csv,.xlsx,.png,.jpg,.jpeg"}
        />
      </Field>
    </FormSheet>
  );
}

export function VersionDecision({ versionId, version }: { versionId: string; version: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ReasonDialog
        trigger={<Button size="sm"><Check className="size-4" /> Approve</Button>}
        title={`Approve version ${version}?`}
        description="Its valid rows become available for distribution once the file is copied to the approved store and its fingerprint is re-checked. The previous published version is replaced."
        confirmLabel="Approve and publish"
        needsReason={false}
        run={(note) => decideDatabaseVersion(versionId, "approve", note)}
        success="Approved. Publishing now."
      />
      <ReasonDialog
        trigger={<Button size="sm" variant="outline"><X className="size-4" /> Reject</Button>}
        title={`Reject version ${version}?`}
        description="The uploader sees your reason. The file and its rows stay on record but are never published."
        confirmLabel="Reject"
        needsReason
        destructive
        run={(note) => decideDatabaseVersion(versionId, "reject", note)}
        success="Rejected"
      />
    </div>
  );
}

export function ArchiveFileButton({ fileId, name }: { fileId: string; name: string }) {
  return (
    <ReasonDialog
      trigger={<Button variant="ghost" size="sm" aria-label={`Archive ${name}`}><Archive className="size-4" /></Button>}
      title={`Archive ${name}?`}
      description="It disappears from the active list. Nothing is deleted; it stays in the archive and the audit log."
      confirmLabel="Archive"
      needsReason
      destructive
      run={(reason) => archiveCampaignFile(fileId, reason)}
      success="File archived"
    />
  );
}
