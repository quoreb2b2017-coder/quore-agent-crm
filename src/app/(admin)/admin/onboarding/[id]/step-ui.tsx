import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, CircleDashed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ONBOARDING_STEPS, type OnboardingStepKey } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

export const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function StepPanel({
  title,
  description,
  done,
  doneLabel = "Step complete",
  pendingLabel = "Pending",
  actions,
  children,
}: {
  title: string;
  description: string;
  done: boolean;
  doneLabel?: string;
  pendingLabel?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="gap-0 py-0 animate-in fade-in slide-in-from-bottom-1 duration-300">
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="min-w-0">
            <h3 className="text-base font-semibold tracking-tight">{title}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                done ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
              )}
            >
              {done ? <CheckCircle2 className="size-3.5" /> : <CircleDashed className="size-3.5" />}
              {done ? doneLabel : pendingLabel}
            </span>
          </div>
        </div>
        <div className="px-5 py-5 sm:px-6">{children}</div>
      </CardContent>
    </Card>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="sm:col-span-full">
      <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</h4>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Field({
  id,
  label,
  hint,
  required,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function StepFooter({
  employeeId,
  current,
  children,
}: {
  employeeId: string;
  current: OnboardingStepKey;
  children?: ReactNode;
}) {
  const index = ONBOARDING_STEPS.findIndex((step) => step.key === current);
  const prev = ONBOARDING_STEPS[index - 1];
  const next = ONBOARDING_STEPS[index + 1];
  const href = (key: string) => `/admin/onboarding/${employeeId}?step=${key}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {prev ? (
        <Button variant="ghost" size="sm" asChild>
          <Link href={href(prev.key)} scroll={false}>
            <ArrowLeft className="size-4" />
            {prev.label}
          </Link>
        </Button>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-2">
        {children}
        {next ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={href(next.key)} scroll={false}>
              Next: {next.label}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
