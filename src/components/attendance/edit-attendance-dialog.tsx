"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormSheet } from "@/components/ui/form-sheet";
import { useActionForm } from "@/hooks/use-action-form";
import { upsertAttendanceByAdmin } from "@/lib/actions/attendance";
import { NATIVE_SELECT_CLASS, toDatetimeLocalIst } from "@/lib/shift";

type AttendanceEdit = {
  status?: string;
  first_check_in?: string | null;
  last_check_out?: string | null;
  notes?: string | null;
};

const STATUSES = [
  { value: "PRESENT", label: "Present" },
  { value: "ABSENT", label: "Absent" },
  { value: "HALF_DAY", label: "Half day" },
  { value: "ON_LEAVE", label: "On leave" },
  { value: "HOLIDAY", label: "Holiday" },
  { value: "WEEK_OFF", label: "Week off" },
];

export function EditAttendanceDialog({
  employeeId,
  employeeName,
  attendanceDate,
  attendance,
}: {
  employeeId: string;
  employeeName: string;
  attendanceDate: string;
  attendance?: AttendanceEdit;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { handleSubmit, isPending, error } = useActionForm(
    (formData) => upsertAttendanceByAdmin({}, formData),
    () => {
      toast.success("Attendance updated");
      setOpen(false);
      router.refresh();
    }
  );

  return (
    <FormSheet
      open={open}
      onOpenChange={setOpen}
      title="Edit attendance"
      description={`${employeeName} · ${attendanceDate} · enter times in IST (US Eastern follows India 6:30 PM)`}
      onSubmit={handleSubmit}
      submitLabel="Save"
      isPending={isPending}
      error={error}
      trigger={
        <Button size="sm" variant="outline">
          <Pencil className="size-3.5" />
          Edit
        </Button>
      }
    >
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="attendanceDate" value={attendanceDate} />
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor={`status-${employeeId}-${attendanceDate}`}>Status</Label>
        <select
          id={`status-${employeeId}-${attendanceDate}`}
          name="status"
          required
          defaultValue={attendance?.status ?? "PRESENT"}
          className={NATIVE_SELECT_CLASS}
        >
          {STATUSES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`checkIn-${employeeId}-${attendanceDate}`}>Check in (IST · maps to US ET)</Label>
        <Input
          id={`checkIn-${employeeId}-${attendanceDate}`}
          name="checkIn"
          type="datetime-local"
          defaultValue={toDatetimeLocalIst(attendance?.first_check_in)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`checkOut-${employeeId}-${attendanceDate}`}>Check out (IST · maps to US ET)</Label>
        <Input
          id={`checkOut-${employeeId}-${attendanceDate}`}
          name="checkOut"
          type="datetime-local"
          defaultValue={toDatetimeLocalIst(attendance?.last_check_out)}
        />
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor={`notes-${employeeId}-${attendanceDate}`}>Notes</Label>
        <Textarea
          id={`notes-${employeeId}-${attendanceDate}`}
          name="notes"
          rows={3}
          defaultValue={attendance?.notes ?? ""}
        />
      </div>
    </FormSheet>
  );
}
