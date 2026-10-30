"use client";

import { useOptimistic, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { SETUP_TASKS, type ChecklistState } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { setSetupTask } from "../actions";
import { StepFooter, StepPanel } from "./step-ui";

export function SetupStep({
  employeeId,
  email,
  hasLogin,
  checklist,
  done,
}: {
  employeeId: string;
  email: string;
  hasLogin: boolean;
  checklist: ChecklistState;
  done: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tasks, setTask] = useOptimistic(
    checklist,
    (state, change: { key: string; done: boolean }) => ({ ...state, [change.key]: change.done })
  );

  function toggle(key: string, value: boolean) {
    startTransition(async () => {
      setTask({ key, done: value });
      const result = await setSetupTask(employeeId, key, value);
      if (result.error) toast.error(result.error);
      router.refresh();
    });
  }

  const doneCount = SETUP_TASKS.filter((task) => tasks[task.key]).length + (hasLogin ? 1 : 0);

  return (
    <StepPanel
      title="First week"
      description="Give access, explain the rules and help them settle into the team."
      done={done}
      pendingLabel={`${doneCount} of ${SETUP_TASKS.length + 1} done`}
    >
      <div className="grid gap-6">
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl border p-4",
            hasLogin ? "border-success/30 bg-success/[0.04]" : "bg-muted/30"
          )}
        >
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-lg",
              hasLogin ? "bg-success/10 text-success" : "bg-primary/10 text-primary"
            )}
          >
            {hasLogin ? <CheckCircle2 className="size-4" /> : <KeyRound className="size-4" />}
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">{hasLogin ? "WorkTrack login is active" : "No WorkTrack login yet"}</p>
            <p className="truncate text-xs text-muted-foreground">
              {hasLogin ? `Signs in with ${email}` : "Create the login from the employee profile."}
            </p>
          </div>
          {!hasLogin ? (
            <Link
              href={`/admin/employees/${employeeId}?tab=profile`}
              className="text-xs font-medium text-primary hover:underline"
            >
              Open profile
            </Link>
          ) : null}
        </div>

        <ul className="divide-y rounded-xl border">
          {SETUP_TASKS.map((task) => {
            const checked = tasks[task.key] === true;
            const id = `task-${task.key}`;
            return (
              <li key={task.key}>
                <label
                  htmlFor={id}
                  className="flex cursor-pointer items-start gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40"
                >
                  <Checkbox
                    id={id}
                    className="mt-0.5"
                    checked={checked}
                    onCheckedChange={(value) => toggle(task.key, value === true)}
                  />
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block text-sm font-medium transition-colors",
                        checked && "text-muted-foreground line-through decoration-muted-foreground/40"
                      )}
                    >
                      {task.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">{task.hint}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <StepFooter employeeId={employeeId} current="setup" />
      </div>
    </StepPanel>
  );
}
