"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GENDER_CHOICES, RELATION_CHOICES } from "@/lib/onboarding";
import type { OnboardingRecord } from "@/lib/queries/onboarding";
import { updateEmployeePersonalDetails, type ActionState } from "../actions";

const initialState: ActionState = {};
const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Admin can edit onboarding personal + bank fields anytime from the employee profile. */
export function EditPersonalDetailsForm({
  employeeId,
  joiningDate,
  workLocation,
  record,
}: {
  employeeId: string;
  joiningDate: string;
  workLocation: string | null;
  record: OnboardingRecord | null;
}) {
  const router = useRouter();
  const action = updateEmployeePersonalDetails.bind(null, employeeId);
  const [state, formAction, isPending] = useActionState(action, initialState);
  const value = (key: keyof OnboardingRecord) => (record?.[key] as string | null) ?? "";
  const [sameAddress, setSameAddress] = useState(
    Boolean(record?.current_address) && record?.current_address === record?.permanent_address
  );

  useEffect(() => {
    if (state.success) {
      toast.success("Personal details saved");
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <form action={formAction} className="grid gap-8">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h3 className="text-sm font-semibold">Personal details</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Admin can update any HR personal field below — DOB, address, IDs, emergency contact, and more.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="dateOfBirth">Date of birth</Label>
          <Input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={value("date_of_birth")} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="gender">Gender</Label>
          <select id="gender" name="gender" defaultValue={value("gender")} className={selectClass}>
            <option value="">Select</option>
            {GENDER_CHOICES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="joiningDatePersonal">Joining date</Label>
          <Input
            id="joiningDatePersonal"
            name="joiningDate"
            type="date"
            defaultValue={joiningDate}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="workLocation">Work location</Label>
          <Input
            id="workLocation"
            name="workLocation"
            defaultValue={workLocation ?? ""}
            placeholder="City / office"
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="personalEmail">Personal email</Label>
          <Input
            id="personalEmail"
            name="personalEmail"
            type="email"
            defaultValue={value("personal_email")}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="panNumber">PAN number</Label>
          <Input
            id="panNumber"
            name="panNumber"
            placeholder="ABCDE1234F"
            className="uppercase"
            defaultValue={value("pan_number")}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="aadhaarNumber">Aadhaar number</Label>
          <Input
            id="aadhaarNumber"
            name="aadhaarNumber"
            inputMode="numeric"
            placeholder="12 digits"
            defaultValue={value("aadhaar_number")}
          />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h3 className="text-sm font-semibold">Address</h3>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="currentAddress">Current address</Label>
          <Textarea
            id="currentAddress"
            name="currentAddress"
            rows={3}
            defaultValue={value("current_address")}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="permanentAddress">Permanent address</Label>
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
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          {sameAddress ? <input type="hidden" name="sameAddress" value="on" /> : null}
          <Checkbox
            id="sameAddress"
            checked={sameAddress}
            onCheckedChange={(checked) => setSameAddress(checked === true)}
          />
          <Label htmlFor="sameAddress" className="text-xs font-normal text-muted-foreground">
            Permanent address is the same
          </Label>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <h3 className="text-sm font-semibold">Emergency contact</h3>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="emergencyContactName">Name</Label>
          <Input
            id="emergencyContactName"
            name="emergencyContactName"
            defaultValue={value("emergency_contact_name")}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="emergencyContactRelation">Relation</Label>
          <select
            id="emergencyContactRelation"
            name="emergencyContactRelation"
            defaultValue={value("emergency_contact_relation")}
            className={selectClass}
          >
            <option value="">Select</option>
            {RELATION_CHOICES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            {value("emergency_contact_relation") &&
            !(RELATION_CHOICES as readonly string[]).includes(value("emergency_contact_relation")) ? (
              <option value={value("emergency_contact_relation")}>
                {value("emergency_contact_relation")}
              </option>
            ) : null}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="emergencyContactPhone">Phone</Label>
          <Input
            id="emergencyContactPhone"
            name="emergencyContactPhone"
            type="tel"
            defaultValue={value("emergency_contact_phone")}
          />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h3 className="text-sm font-semibold">Bank details</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Optional — leave blank if not on file yet.</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="bankAccountHolder">Account holder</Label>
          <Input
            id="bankAccountHolder"
            name="bankAccountHolder"
            defaultValue={value("bank_account_holder")}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="bankName">Bank name</Label>
          <Input id="bankName" name="bankName" defaultValue={value("bank_name")} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="bankAccountNumber">Account number</Label>
          <Input
            id="bankAccountNumber"
            name="bankAccountNumber"
            inputMode="numeric"
            defaultValue={value("bank_account_number")}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="bankIfsc">IFSC</Label>
          <Input
            id="bankIfsc"
            name="bankIfsc"
            className="uppercase"
            placeholder="HDFC0001234"
            defaultValue={value("bank_ifsc")}
          />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h3 className="text-sm font-semibold">Background</h3>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="previousCompany">Previous company</Label>
          <Input
            id="previousCompany"
            name="previousCompany"
            defaultValue={value("previous_company")}
            placeholder="Leave blank for freshers"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="notes">HR notes</Label>
          <Textarea id="notes" name="notes" rows={2} defaultValue={value("notes")} />
        </div>
      </section>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save personal details
        </Button>
      </div>
    </form>
  );
}
