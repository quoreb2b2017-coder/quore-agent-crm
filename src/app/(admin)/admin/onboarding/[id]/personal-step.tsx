"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { OnboardingRecord } from "@/lib/queries/onboarding";
import { GENDER_CHOICES, RELATION_CHOICES } from "@/lib/onboarding";
import { savePersonalDetails, type ActionState } from "../actions";
import { ChoiceField } from "./choice-field";
import { Field, SectionTitle, StepFooter, StepPanel, selectClass } from "./step-ui";

const initialState: ActionState = {};

export function PersonalStep({
  employeeId,
  joiningDate,
  record,
  done,
}: {
  employeeId: string;
  joiningDate: string;
  record: OnboardingRecord | null;
  done: boolean;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    savePersonalDetails.bind(null, employeeId),
    initialState
  );
  const value = (key: keyof OnboardingRecord) => (record?.[key] as string | null) ?? "";
  const [sameAddress, setSameAddress] = useState(
    Boolean(record?.current_address) && record?.current_address === record?.permanent_address
  );

  useEffect(() => {
    if (state.success) {
      toast.success("Personal details saved");
      router.refresh();
    }
  }, [state, router]);

  return (
    <StepPanel
      title="Personal details"
      description="Needed for HR records. Date of birth, current address and emergency phone complete this step."
      done={done}
    >
      <form action={formAction} className="grid gap-8">
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SectionTitle>Basic</SectionTitle>
          <Field id="dateOfBirth" label="Date of birth" required>
            <Input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={value("date_of_birth")} />
          </Field>
          <Field id="gender" label="Gender">
            <select id="gender" name="gender" defaultValue={value("gender")} className={selectClass}>
              <option value="">Select</option>
              {GENDER_CHOICES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field id="joiningDate" label="Joining date" required>
            <Input id="joiningDate" name="joiningDate" type="date" defaultValue={joiningDate} required />
          </Field>
          <Field id="personalEmail" label="Personal email" className="sm:col-span-2 lg:col-span-1">
            <Input id="personalEmail" name="personalEmail" type="email" defaultValue={value("personal_email")} />
          </Field>
          <Field id="panNumber" label="PAN number">
            <Input
              id="panNumber"
              name="panNumber"
              placeholder="ABCDE1234F"
              className="uppercase"
              defaultValue={value("pan_number")}
            />
          </Field>
          <Field id="aadhaarNumber" label="Aadhaar number">
            <Input
              id="aadhaarNumber"
              name="aadhaarNumber"
              inputMode="numeric"
              placeholder="12 digits"
              defaultValue={value("aadhaar_number")}
            />
          </Field>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SectionTitle>Address</SectionTitle>
          <Field id="currentAddress" label="Current address" required>
            <Textarea id="currentAddress" name="currentAddress" rows={3} defaultValue={value("current_address")} />
          </Field>
          <Field id="permanentAddress" label="Permanent address">
            {sameAddress ? (
              <div className="flex min-h-[76px] items-center rounded-lg border border-dashed px-3 text-sm text-muted-foreground">
                Same as current address
              </div>
            ) : (
              <Textarea
                id="permanentAddress"
                name="permanentAddress"
                rows={3}
                defaultValue={value("permanent_address")}
              />
            )}
          </Field>
          <div className="flex items-center gap-2 sm:col-start-2">
            <Checkbox
              id="sameAddress"
              name="sameAddress"
              checked={sameAddress}
              onCheckedChange={(checked) => setSameAddress(checked === true)}
            />
            <Label htmlFor="sameAddress" className="text-xs font-normal text-muted-foreground">
              Permanent address is the same
            </Label>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SectionTitle>Emergency contact</SectionTitle>
          <Field id="emergencyContactName" label="Name">
            <Input
              id="emergencyContactName"
              name="emergencyContactName"
              defaultValue={value("emergency_contact_name")}
            />
          </Field>
          <Field id="emergencyContactRelation" label="Relation">
            <ChoiceField
              id="emergencyContactRelation"
              name="emergencyContactRelation"
              options={RELATION_CHOICES}
              defaultValue={value("emergency_contact_relation")}
              placeholder="Select relation"
              otherPlaceholder="e.g. Uncle"
            />
          </Field>
          <Field id="emergencyContactPhone" label="Phone" required>
            <Input
              id="emergencyContactPhone"
              name="emergencyContactPhone"
              type="tel"
              defaultValue={value("emergency_contact_phone")}
            />
          </Field>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SectionTitle>Background</SectionTitle>
          <Field id="previousCompany" label="Previous company" hint="Leave blank for freshers.">
            <Input id="previousCompany" name="previousCompany" defaultValue={value("previous_company")} />
          </Field>
          <Field id="notes" label="HR notes">
            <Textarea id="notes" name="notes" rows={2} defaultValue={value("notes")} />
          </Field>
        </section>

        {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

        <StepFooter employeeId={employeeId} current="personal">
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Save details
          </Button>
        </StepFooter>
      </form>
    </StepPanel>
  );
}
