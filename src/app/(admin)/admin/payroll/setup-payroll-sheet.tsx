"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSheet } from "@/components/ui/form-sheet";
import { useActionForm } from "@/hooks/use-action-form";
import { setupPayroll } from "./actions";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import { todayIso } from "@/lib/format";
import type { PayLine } from "@/lib/payroll";

export type PayrollEmployeeOption = {
  id: string;
  full_name: string;
  employee_code: string;
};

export type PayrollDefaults = {
  employeeId?: string;
  baseSalary?: number | null;
  hra?: number;
  allowance?: number;
  conveyance?: number;
  incomeTax?: number;
  providentFund?: number;
  professionalTax?: number;
  extraEarnings?: PayLine[];
  extraDeductions?: PayLine[];
  payFrequency?: string;
  effectiveFrom?: string;
};

type ExtraLine = PayLine & { key: string };

function toExtraLines(rows?: PayLine[]): ExtraLine[] {
  return (rows ?? []).map((row, index) => ({
    key: `${row.name}-${index}`,
    name: row.name,
    amount: row.amount,
  }));
}

export function SetupPayrollSheet({
  employees,
  defaults,
  triggerLabel = "Setup payroll",
  compact = false,
}: {
  employees: PayrollEmployeeOption[];
  defaults?: PayrollDefaults;
  triggerLabel?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [extraEarnings, setExtraEarnings] = useState<ExtraLine[]>(() =>
    toExtraLines(defaults?.extraEarnings)
  );
  const [extraDeductions, setExtraDeductions] = useState<ExtraLine[]>(() =>
    toExtraLines(defaults?.extraDeductions)
  );
  const lockedEmployee = compact && Boolean(defaults?.employeeId);
  const selected = employees.find((employee) => employee.id === defaults?.employeeId);
  const { handleSubmit, isPending, error } = useActionForm(
    (formData) => setupPayroll({}, formData),
    () => {
      toast.success("Payroll saved. Salary slips will update automatically.");
      setOpen(false);
    }
  );

  function addEarning() {
    setExtraEarnings((rows) => [...rows, { key: `earn-${Date.now()}`, name: "", amount: 0 }]);
  }

  function addDeduction() {
    setExtraDeductions((rows) => [...rows, { key: `ded-${Date.now()}`, name: "", amount: 0 }]);
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setExtraEarnings(toExtraLines(defaults?.extraEarnings));
          setExtraDeductions(toExtraLines(defaults?.extraDeductions));
        }
      }}
      title={compact && triggerLabel === "Edit" ? "Update payroll" : "Setup payroll"}
      description="Monthly package on a 30-day cycle. Unpaid leave and absences reduce paid days and earnings. Payslips generate on the 10th."
      onSubmit={handleSubmit}
      submitLabel="Save payroll"
      isPending={isPending}
      error={error}
      trigger={
        <Button size="sm" variant={compact ? "outline" : "default"}>
          {compact && triggerLabel === "Edit" ? (
            <Pencil className="size-3.5" />
          ) : (
            <Plus className="size-4" />
          )}
          {triggerLabel}
        </Button>
      }
    >
      {lockedEmployee ? (
        <div className="grid gap-1 rounded-xl border bg-muted/40 px-3 py-2.5 sm:col-span-2">
          <p className="text-xs text-muted-foreground">Employee</p>
          <p className="text-sm font-medium">
            {selected?.full_name ?? "Selected employee"}
            {selected ? (
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                {selected.employee_code}
              </span>
            ) : null}
          </p>
          <input type="hidden" name="employeeId" value={defaults?.employeeId} />
        </div>
      ) : (
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="employeeId">Employee</Label>
          <select
            id="employeeId"
            name="employeeId"
            required
            defaultValue={defaults?.employeeId ?? ""}
            className={NATIVE_SELECT_CLASS}
          >
            <option value="" disabled>
              Select employee
            </option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.full_name} ({employee.employee_code})
              </option>
            ))}
          </select>
        </div>
      )}

      <p className="sm:col-span-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Earnings
      </p>
      <div className="grid gap-2">
        <Label htmlFor={`baseSalary-${defaults?.employeeId ?? "new"}`}>Basic</Label>
        <Input
          id={`baseSalary-${defaults?.employeeId ?? "new"}`}
          name="baseSalary"
          type="number"
          min="1"
          step="1"
          required
          defaultValue={defaults?.baseSalary ?? ""}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`hra-${defaults?.employeeId ?? "new"}`}>House rent allowance</Label>
        <Input
          id={`hra-${defaults?.employeeId ?? "new"}`}
          name="hra"
          type="number"
          min="0"
          step="1"
          defaultValue={defaults?.hra ?? 0}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`allowance-${defaults?.employeeId ?? "new"}`}>Special allowance</Label>
        <Input
          id={`allowance-${defaults?.employeeId ?? "new"}`}
          name="allowance"
          type="number"
          min="0"
          step="1"
          defaultValue={defaults?.allowance ?? 0}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`conveyance-${defaults?.employeeId ?? "new"}`}>Conveyance allowance</Label>
        <Input
          id={`conveyance-${defaults?.employeeId ?? "new"}`}
          name="conveyance"
          type="number"
          min="0"
          step="1"
          defaultValue={defaults?.conveyance ?? 0}
        />
      </div>

      <div className="grid gap-2 sm:col-span-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Extra earning sections</p>
          <Button type="button" size="sm" variant="outline" onClick={addEarning}>
            <Plus className="size-3.5" />
            Add earning
          </Button>
        </div>
        {extraEarnings.map((row, index) => (
          <div key={row.key} className="grid grid-cols-[1fr_7rem_auto] gap-2">
            <Input
              name="extraEarningName"
              placeholder="Section name"
              value={row.name}
              onChange={(event) =>
                setExtraEarnings((rows) =>
                  rows.map((item, i) => (i === index ? { ...item, name: event.target.value } : item))
                )
              }
            />
            <Input
              name="extraEarningAmount"
              type="number"
              min="0"
              step="1"
              value={row.amount || ""}
              placeholder="0"
              onChange={(event) =>
                setExtraEarnings((rows) =>
                  rows.map((item, i) =>
                    i === index ? { ...item, amount: Number(event.target.value) || 0 } : item
                  )
                )
              }
            />
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => setExtraEarnings((rows) => rows.filter((_, i) => i !== index))}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <p className="sm:col-span-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Deductions
      </p>
      <div className="grid gap-2">
        <Label htmlFor={`incomeTax-${defaults?.employeeId ?? "new"}`}>Income tax</Label>
        <Input
          id={`incomeTax-${defaults?.employeeId ?? "new"}`}
          name="incomeTax"
          type="number"
          min="0"
          step="1"
          defaultValue={defaults?.incomeTax ?? 0}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`providentFund-${defaults?.employeeId ?? "new"}`}>Provident fund</Label>
        <Input
          id={`providentFund-${defaults?.employeeId ?? "new"}`}
          name="providentFund"
          type="number"
          min="0"
          step="1"
          defaultValue={defaults?.providentFund ?? 0}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`professionalTax-${defaults?.employeeId ?? "new"}`}>Professional tax</Label>
        <Input
          id={`professionalTax-${defaults?.employeeId ?? "new"}`}
          name="professionalTax"
          type="number"
          min="0"
          step="1"
          defaultValue={defaults?.professionalTax ?? 0}
        />
      </div>

      <div className="grid gap-2 sm:col-span-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Extra deduction sections</p>
          <Button type="button" size="sm" variant="outline" onClick={addDeduction}>
            <Plus className="size-3.5" />
            Add deduction
          </Button>
        </div>
        {extraDeductions.map((row, index) => (
          <div key={row.key} className="grid grid-cols-[1fr_7rem_auto] gap-2">
            <Input
              name="extraDeductionName"
              placeholder="Section name"
              value={row.name}
              onChange={(event) =>
                setExtraDeductions((rows) =>
                  rows.map((item, i) => (i === index ? { ...item, name: event.target.value } : item))
                )
              }
            />
            <Input
              name="extraDeductionAmount"
              type="number"
              min="0"
              step="1"
              value={row.amount || ""}
              placeholder="0"
              onChange={(event) =>
                setExtraDeductions((rows) =>
                  rows.map((item, i) =>
                    i === index ? { ...item, amount: Number(event.target.value) || 0 } : item
                  )
                )
              }
            />
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => setExtraDeductions((rows) => rows.filter((_, i) => i !== index))}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`payFrequency-${defaults?.employeeId ?? "new"}`}>Pay frequency</Label>
        <select
          id={`payFrequency-${defaults?.employeeId ?? "new"}`}
          name="payFrequency"
          defaultValue={defaults?.payFrequency ?? "MONTHLY"}
          className={NATIVE_SELECT_CLASS}
        >
          <option value="MONTHLY">Monthly</option>
          <option value="WEEKLY">Weekly</option>
          <option value="BIWEEKLY">Biweekly</option>
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`effectiveFrom-${defaults?.employeeId ?? "new"}`}>Effective from</Label>
        <Input
          id={`effectiveFrom-${defaults?.employeeId ?? "new"}`}
          name="effectiveFrom"
          type="date"
          required
          defaultValue={defaults?.effectiveFrom ?? todayIso()}
        />
      </div>
    </FormSheet>
  );
}
