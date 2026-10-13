"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionForm } from "@/hooks/use-action-form";
import { NATIVE_SELECT_CLASS } from "@/lib/shift";
import {
  TIME_ZONE_OPTIONS,
  formatMinutesLabel,
  minutesToTimeValue,
  timeZoneShort,
  type WorkSettings,
} from "@/lib/work-settings";
import { saveWorkSettings } from "./actions";

export function WorkSettingsForm({ settings }: { settings: WorkSettings }) {
  const router = useRouter();
  const { handleSubmit, isPending, error } = useActionForm(
    (formData) => saveWorkSettings({}, formData),
    () => {
      toast.success("Work settings saved");
      router.refresh();
    }
  );
  const zones = TIME_ZONE_OPTIONS.some((zone) => zone.id === settings.timeZone)
    ? TIME_ZONE_OPTIONS
    : [{ id: settings.timeZone, label: settings.timeZone }, ...TIME_ZONE_OPTIONS];

  return (
    <form onSubmit={handleSubmit} className="grid gap-5 sm:grid-cols-2">
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="timeZone">Time zone</Label>
        <select
          id="timeZone"
          name="timeZone"
          defaultValue={settings.timeZone}
          className={NATIVE_SELECT_CLASS}
        >
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Login, logout, late, and the shift date all use this zone. Now{" "}
          {formatMinutesLabel(settings.loginMinutes, settings.timeZone)} login ·{" "}
          {timeZoneShort(settings.timeZone)}.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="login">Login time</Label>
        <Input
          id="login"
          name="login"
          type="time"
          required
          defaultValue={minutesToTimeValue(settings.loginMinutes)}
        />
        <p className="text-xs text-muted-foreground">
          Productive time starts at this time. Sign-in after it is marked Late, using the time zone above. They can still log in.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="logout">Logout time</Label>
        <Input
          id="logout"
          name="logout"
          type="time"
          required
          defaultValue={minutesToTimeValue(settings.logoutMinutes)}
        />
        <p className="text-xs text-muted-foreground">
          If logout is earlier than login, the shift runs overnight into the next day.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="annualPaidLeaveDays">Default paid leave / year</Label>
        <Input
          id="annualPaidLeaveDays"
          name="annualPaidLeaveDays"
          type="number"
          min={0}
          max={366}
          step="0.5"
          required
          defaultValue={settings.annualPaidLeaveDays}
        />
        <p className="text-xs text-muted-foreground">
          Used when an employee has no custom balance. Change someone&apos;s remaining days on Leave.
        </p>
      </div>
      {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
