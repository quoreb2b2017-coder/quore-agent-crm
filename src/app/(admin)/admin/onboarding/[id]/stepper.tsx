import Link from "next/link";
import { Check } from "lucide-react";
import { ONBOARDING_STEPS, type OnboardingStepKey } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

export function OnboardingStepper({
  employeeId,
  current,
  stepState,
}: {
  employeeId: string;
  current: OnboardingStepKey;
  stepState: Record<OnboardingStepKey, boolean>;
}) {
  return (
    <nav aria-label="Onboarding steps" className="lg:sticky lg:top-20 lg:self-start">
      <ol className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:gap-0 lg:overflow-visible lg:px-0 lg:pb-0">
        {ONBOARDING_STEPS.map((step, index) => {
          const done = stepState[step.key];
          const active = step.key === current;
          const last = index === ONBOARDING_STEPS.length - 1;
          return (
            <li key={step.key} className="relative shrink-0 lg:shrink">
              {!last ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-11 bottom-0 left-[27px] hidden w-px lg:block",
                    done ? "bg-success/40" : "bg-border"
                  )}
                />
              ) : null}
              <Link
                href={`/admin/onboarding/${employeeId}?step=${step.key}`}
                scroll={false}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-200 lg:border-transparent lg:py-3",
                  active
                    ? "border-primary/30 bg-primary/[0.06] shadow-sm lg:border-primary/20"
                    : "bg-card hover:bg-muted/50 lg:bg-transparent"
                )}
              >
                <span
                  className={cn(
                    "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all duration-300",
                    done
                      ? "border-success bg-success text-white"
                      : active
                        ? "border-primary bg-background text-primary ring-4 ring-primary/10"
                        : "border-border bg-background text-muted-foreground"
                  )}
                >
                  {done ? <Check className="size-4" strokeWidth={3} /> : index + 1}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block text-sm font-medium whitespace-nowrap lg:whitespace-normal",
                      !active && !done && "text-muted-foreground group-hover:text-foreground"
                    )}
                  >
                    {step.label}
                  </span>
                  <span className="hidden text-xs text-muted-foreground lg:block">{step.description}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
