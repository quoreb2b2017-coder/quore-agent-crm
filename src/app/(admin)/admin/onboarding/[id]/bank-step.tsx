"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CheckCircle2, Landmark, Loader2, Save, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatInr } from "@/lib/format";
import type { OnboardingRecord } from "@/lib/queries/onboarding";
import { cn } from "@/lib/utils";
import { BANK_CHOICES } from "@/lib/onboarding";
import { saveBankDetails, type ActionState } from "../actions";
import { ChoiceField } from "./choice-field";
import { Field, StepFooter, StepPanel } from "./step-ui";

const initialState: ActionState = {};

function StatusTile({
  icon: Icon,
  title,
  body,
  done,
  action,
}: {
  icon: typeof Wallet;
  title: string;
  body: string;
  done: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4",
        done ? "border-success/30 bg-success/[0.04]" : "bg-muted/30"
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          done ? "bg-success/10 text-success" : "bg-primary/10 text-primary"
        )}
      >
        {done ? <CheckCircle2 className="size-4" /> : <Icon className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{body}</p>
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  );
}

export function BankStep({
  employeeId,
  record,
  bankDone,
  hasPayroll,
  offerCtc,
  done,
}: {
  employeeId: string;
  record: OnboardingRecord | null;
  bankDone: boolean;
  hasPayroll: boolean;
  offerCtc: number | null;
  done: boolean;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(saveBankDetails.bind(null, employeeId), initialState);
  const value = (key: keyof OnboardingRecord) => (record?.[key] as string | null) ?? "";

  useEffect(() => {
    if (state.success) {
      toast.success("Bank details saved");
      router.refresh();
    }
  }, [state, router]);

  return (
    <StepPanel
      title="Bank & payroll"
      description="Salary account for payouts, then add the salary in Payroll so payslips are generated."
      done={done}
    >
      <div className="grid gap-6">
        <div className="grid gap-3 md:grid-cols-2">
          <StatusTile
            icon={Landmark}
            title={bankDone ? "Bank account saved" : "Bank account"}
            body={
              bankDone
                ? `${value("bank_name") || "Bank"} · ending ${value("bank_account_number").slice(-4)}`
                : "Fill the form below."
            }
            done={bankDone}
          />
          <StatusTile
            icon={Wallet}
            title={hasPayroll ? "Payroll is set up" : "Payroll not set up"}
            body={
              offerCtc
                ? `Offer CTC ${formatInr(offerCtc)} / year · about ${formatInr(offerCtc / 12)} / month`
                : "Add base salary, HRA and allowances."
            }
            done={hasPayroll}
            action={
              <Button variant={hasPayroll ? "ghost" : "outline"} size="xs" asChild>
                <Link href={`/admin/payroll?employee=${employeeId}`}>
                  {hasPayroll ? "View in Payroll" : "Set up payroll"}
                  <ArrowUpRight className="size-3" />
                </Link>
              </Button>
            }
          />
        </div>

        <form action={formAction} className="grid gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="bankAccountHolder" label="Account holder name" required>
              <Input
                id="bankAccountHolder"
                name="bankAccountHolder"
                defaultValue={value("bank_account_holder")}
                required
              />
            </Field>
            <Field id="bankName" label="Bank name" required>
              <ChoiceField
                id="bankName"
                name="bankName"
                options={BANK_CHOICES}
                defaultValue={value("bank_name")}
                placeholder="Select bank"
                otherLabel="Other bank (type name)"
                otherPlaceholder="Bank name"
                required
              />
            </Field>
            <Field id="bankAccountNumber" label="Account number" required>
              <Input
                id="bankAccountNumber"
                name="bankAccountNumber"
                inputMode="numeric"
                defaultValue={value("bank_account_number")}
                required
              />
            </Field>
            <Field id="bankIfsc" label="IFSC code" required>
              <Input
                id="bankIfsc"
                name="bankIfsc"
                placeholder="HDFC0001234"
                className="uppercase"
                defaultValue={value("bank_ifsc")}
                required
              />
            </Field>
          </div>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <StepFooter employeeId={employeeId} current="bank">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              Save bank details
            </Button>
          </StepFooter>
        </form>
      </div>
    </StepPanel>
  );
}
