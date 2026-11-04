"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionForm } from "@/hooks/use-action-form";
import { setEmployeeOvertimeByAdmin } from "@/lib/actions/attendance";
import { todayIso } from "@/lib/format";
import { OT_WINDOW_MINUTES, PRODUCTIVE_HOURS_LABEL } from "@/lib/shift";

export function EmployeeOvertimeForm({
  employeeId,
  employeeName,
}: {
  employeeId: string;
  employeeName: string;
}) {
  const router = useRouter();
  const { handleSubmit, isPending, error } = useActionForm(
    (formData) => setEmployeeOvertimeByAdmin({}, formData),
    () => {
      toast.success("Overtime saved for that date");
      router.refresh();
    }
  );

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="employeeId" value={employeeId} />
      <div className="sm:col-span-2">
        <h3 className="text-sm font-semibold">Overtime (by date)</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          After {employeeName}&apos;s logout: time first fills {PRODUCTIVE_HOURS_LABEL} shortfall, then
          OT. OT never auto-adds — admin must approve (Team Today popup or here). 0 clears OT for that
          day. Max {OT_WINDOW_MINUTES} minutes ({OT_WINDOW_MINUTES / 60}h).
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`ot-date-${employeeId}`}>Date</Label>
        <Input
          id={`ot-date-${employeeId}`}
          name="attendanceDate"
          type="date"
          required
          defaultValue={todayIso()}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`ot-mins-${employeeId}`}>Approve OT minutes</Label>
        <Input
          id={`ot-mins-${employeeId}`}
          name="overtimeMinutes"
          type="number"
          min={0}
          max={OT_WINDOW_MINUTES}
          step={5}
          required
          defaultValue={60}
        />
        <p className="text-xs text-muted-foreground">
          Enter any amount up to {OT_WINDOW_MINUTES} minutes ({OT_WINDOW_MINUTES / 60} hours).
        </p>
      </div>
      {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
      <div className="sm:col-span-2">
        <Button type="submit" variant="outline" disabled={isPending}>
          {isPending ? "Saving…" : "Save overtime for date"}
        </Button>
      </div>
    </form>
  );
}
