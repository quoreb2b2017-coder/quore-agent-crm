"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, CircleDashed, Loader2, PartyPopper, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { WORK_STEPS, type OnboardingStepKey } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { setOnboardingCompleted } from "../actions";
import { StepFooter, StepPanel } from "./step-ui";

export function ReviewStep({
  employeeId,
  firstName,
  completed,
  completedLine,
  stepState,
  summaries,
}: {
  employeeId: string;
  firstName: string;
  completed: boolean;
  completedLine: string | null;
  stepState: Record<OnboardingStepKey, boolean>;
  summaries: Record<OnboardingStepKey, string>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const pending = WORK_STEPS.filter((step) => !stepState[step.key]);

  function run(next: boolean) {
    if (!next && !window.confirm("Reopen onboarding for this employee?")) return;
    startTransition(async () => {
      const result = await setOnboardingCompleted(employeeId, next);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(next ? `${firstName} is fully onboarded` : "Onboarding reopened");
      router.refresh();
    });
  }

  return (
    <StepPanel
      title="Review & finish"
      description="Everything in one place. Close onboarding once every step is green."
      done={completed}
      doneLabel="Onboarding completed"
      pendingLabel={pending.length ? `${pending.length} step${pending.length > 1 ? "s" : ""} left` : "Ready to finish"}
    >
      <div className="grid gap-6">
        {completed ? (
          <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/[0.06] p-4 animate-in fade-in zoom-in-95 duration-300">
            <span className="flex size-10 items-center justify-center rounded-full bg-success/15 text-success">
              <PartyPopper className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">{firstName} is fully onboarded</p>
              {completedLine ? <p className="text-xs text-muted-foreground">{completedLine}</p> : null}
            </div>
          </div>
        ) : null}

        <ol className="divide-y rounded-xl border">
          {WORK_STEPS.map((step, index) => {
            const done = stepState[step.key];
            return (
              <li key={step.key}>
                <Link
                  href={`/admin/onboarding/${employeeId}?step=${step.key}`}
                  scroll={false}
                  className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      done ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {done ? <CheckCircle2 className="size-4" /> : index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{step.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{summaries[step.key]}</span>
                  </span>
                  {done ? null : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-warning-foreground">
                      <CircleDashed className="size-3.5" />
                      Pending
                    </span>
                  )}
                  <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            );
          })}
        </ol>

        <StepFooter employeeId={employeeId} current="review">
          {completed ? (
            <Button variant="outline" size="sm" disabled={isPending} onClick={() => run(false)}>
              {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
              Reopen
            </Button>
          ) : (
            <Button size="sm" disabled={isPending || pending.length > 0} onClick={() => run(true)}>
              {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              Complete onboarding
            </Button>
          )}
        </StepFooter>
      </div>
    </StepPanel>
  );
}
