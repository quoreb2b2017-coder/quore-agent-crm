"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileCheck2, Info, Loader2, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { acknowledgePolicy } from "@/lib/actions/policies";
import type { PolicyDocument } from "@/lib/policies";
import { cn } from "@/lib/utils";

const TONE = {
  yes: { Icon: Check, heading: "text-primary", badge: "bg-mint-soft text-primary" },
  no: { Icon: X, heading: "text-destructive", badge: "bg-destructive/10 text-destructive" },
  info: { Icon: Info, heading: "text-foreground", badge: "bg-muted text-muted-foreground" },
} as const;

/** Shows each unread notice in turn. "Later" closes it until the next page load; only reading it records anything. */
export function PolicyAcknowledgementDialog({ documents }: { documents: PolicyDocument[] }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(true);
  const [understood, setUnderstood] = useState(false);
  const [isPending, startTransition] = useTransition();
  const document = documents[index];
  if (!document) return null;

  function acknowledge() {
    startTransition(async () => {
      const result = await acknowledgePolicy(document.key, document.version);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Thank you. Your acknowledgement is recorded.");
      if (index + 1 < documents.length) {
        setIndex(index + 1);
        setUnderstood(false);
      } else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="flex max-h-[92svh] flex-col gap-0 overflow-hidden rounded-md p-0 sm:max-w-2xl"
        showCloseButton={false}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <header className="flex items-start gap-3 bg-ink px-5 py-4 text-ink-foreground">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-mint text-ink">
            <FileCheck2 className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="text-base font-semibold text-white">{document.title}</DialogTitle>
              <span className="rounded-sm bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-white/80">
                Please read
              </span>
            </div>
            <DialogDescription className="mt-1 text-[13px] text-white/75">{document.summary}</DialogDescription>
          </div>
          {documents.length > 1 ? (
            <span className="shrink-0 text-xs font-semibold text-white/70 tabular-nums">
              {index + 1} of {documents.length}
            </span>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {document.sections.map((section) => {
            const tone = TONE[section.tone];
            return (
              <section key={section.heading} className="grid border-b sm:grid-cols-[11rem_minmax(0,1fr)]">
                <h3
                  className={cn(
                    "flex items-center gap-2 border-b bg-muted px-4 py-2.5 text-[13px] font-semibold sm:border-r sm:border-b-0 sm:py-3",
                    tone.heading
                  )}
                >
                  <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-sm", tone.badge)}>
                    <tone.Icon className="size-3.5" aria-hidden />
                  </span>
                  {section.heading}
                </h3>
                <ul className="divide-y">
                  {section.items.map((item) => (
                    <li key={item} className="flex gap-2.5 px-4 py-2 text-[13px] leading-5 text-foreground/85">
                      <tone.Icon className={cn("mt-0.5 size-3.5 shrink-0", tone.heading)} aria-hidden />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <footer className="flex flex-col gap-3 border-t bg-muted px-5 py-3">
          <label className="flex cursor-pointer items-start gap-2.5 text-[13px] font-medium">
            <Checkbox
              checked={understood}
              onCheckedChange={(value) => setUnderstood(value === true)}
              className="mt-0.5"
              aria-describedby="policy-version"
            />
            <span>I have read this notice and understand what WorkTrack records.</span>
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p id="policy-version" className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" aria-hidden />
              Version {document.version} · saved with your name and time
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-sm bg-card" disabled={isPending} onClick={() => setOpen(false)}>
                Remind me later
              </Button>
              <Button className="rounded-sm" disabled={isPending || !understood} onClick={acknowledge}>
                {isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                I have read this
              </Button>
            </div>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
