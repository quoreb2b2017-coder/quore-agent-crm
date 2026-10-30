"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, FileText, Loader2, Plus, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ONBOARDING_DOC_MAX_BYTES,
  ONBOARDING_DOC_TYPES,
  onboardingDocLabel,
} from "@/lib/onboarding";
import type { OnboardingDocument } from "@/lib/queries/onboarding";
import { cn } from "@/lib/utils";
import { deleteOnboardingDocument } from "../actions";
import { StepFooter, StepPanel } from "./step-ui";

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocSlot({
  employeeId,
  type,
  label,
  hint,
  required,
  files,
}: {
  employeeId: string;
  type: string;
  label: string;
  hint: string;
  required: boolean;
  files: OnboardingDocument[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const has = files.length > 0;

  async function upload(file: File) {
    if (file.size > ONBOARDING_DOC_MAX_BYTES) {
      toast.error("Files can be up to 5 MB");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.set("employeeId", employeeId);
      form.set("docType", type);
      form.set("file", file);
      const response = await fetch("/api/onboarding/documents", { method: "POST", body: form });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        toast.error(result.error ?? "Upload failed");
        return;
      }
      toast.success(`${label} uploaded`);
      router.refresh();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function remove(doc: OnboardingDocument) {
    if (!window.confirm(`Delete ${doc.fileName}?`)) return;
    setDeletingId(doc.id);
    startTransition(async () => {
      const result = await deleteOnboardingDocument(employeeId, doc.id);
      setDeletingId(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Document deleted");
      router.refresh();
    });
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) void upload(file);
      }}
      className={cn(
        "flex flex-col rounded-xl border bg-card p-4 transition-all",
        has ? "border-success/30 bg-success/[0.03]" : "border-dashed",
        dragging && "border-primary bg-primary/5 ring-3 ring-primary/15"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            has ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
          )}
        >
          {has ? <CheckCircle2 className="size-4" /> : <FileText className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
            {label}
            {required ? (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                Required
              </span>
            ) : (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Optional
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>

      {has ? (
        <ul className="mt-3 space-y-1.5">
          {files.map((doc) => (
            <li key={doc.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5">
              <span className="min-w-0 flex-1 truncate text-xs">
                <span className="font-medium">{doc.fileName}</span>
                <span className="text-muted-foreground"> · {formatSize(doc.sizeBytes)}</span>
              </span>
              {doc.url ? (
                <Button variant="ghost" size="icon-xs" asChild>
                  <a href={doc.url} target="_blank" rel="noreferrer" aria-label={`Open ${doc.fileName}`}>
                    <ExternalLink className="size-3" />
                  </a>
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Delete ${doc.fileName}`}
                disabled={deletingId === doc.id}
                onClick={() => remove(doc)}
              >
                {deletingId === doc.id ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <Button
        type="button"
        variant={has ? "ghost" : "outline"}
        size="sm"
        className="mt-3 self-start"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : has ? (
          <Plus className="size-3.5" />
        ) : (
          <UploadCloud className="size-3.5" />
        )}
        {uploading ? "Uploading…" : has ? "Add another" : "Upload or drop file"}
      </Button>
    </div>
  );
}

export function DocumentsStep({
  employeeId,
  documents,
  missing,
  done,
}: {
  employeeId: string;
  documents: OnboardingDocument[];
  missing: string[];
  done: boolean;
}) {
  return (
    <StepPanel
      title="Documents"
      description="PDF, JPG, PNG, WEBP or Word, up to 5 MB each. Only Super Admin and HR can open these files."
      done={done}
      doneLabel="All required collected"
      pendingLabel={`${missing.length} required left`}
    >
      <div className="grid gap-6">
        {missing.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Still needed: <span className="font-medium text-foreground">{missing.map(onboardingDocLabel).join(", ")}</span>
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {ONBOARDING_DOC_TYPES.map((item) => (
            <DocSlot
              key={item.key}
              employeeId={employeeId}
              type={item.key}
              label={item.label}
              hint={item.hint}
              required={item.required}
              files={documents.filter((doc) => doc.docType === item.key)}
            />
          ))}
        </div>
        <StepFooter employeeId={employeeId} current="documents" />
      </div>
    </StepPanel>
  );
}
