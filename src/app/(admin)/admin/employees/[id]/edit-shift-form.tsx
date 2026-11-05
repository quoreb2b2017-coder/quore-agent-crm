"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/format";
import {
  formatMinutesLabel,
  minutesToTimeValue,
  parseWorkSchedule,
  shiftSpansMidnight,
  timeValueToMinutes,
  timeZoneShort,
  type WorkSettings,
} from "@/lib/work-settings";
import { updateEmployeeShift, type ActionState } from "../actions";
import type { Json } from "@/types/supabase";

const initialState: ActionState = {};

export function EditShiftForm({
  employeeId,
  workSchedule,
  companySettings,
}: {
  employeeId: string;
  workSchedule: Json;
  companySettings: WorkSettings;
}) {
  const router = useRouter();
  const action = updateEmployeeShift.bind(null, employeeId);
  const [state, formAction, isPending] = useActionState(action, initialState);
  const savedSchedule = parseWorkSchedule(workSchedule);
  const [customShift, setCustomShift] = useState(Boolean(savedSchedule));
  const [login, setLogin] = useState(
    minutesToTimeValue(savedSchedule?.loginMinutes ?? companySettings.loginMinutes)
  );
  const [logout, setLogout] = useState(
    minutesToTimeValue(savedSchedule?.logoutMinutes ?? companySettings.logoutMinutes)
  );

  useEffect(() => {
    if (state.success) {
      toast.success("Shift saved — times apply from the new login/logout");
      router.refresh();
    }
  }, [state.success, router]);

  const customLoginMinutes = timeValueToMinutes(login);
  const customLogoutMinutes = timeValueToMinutes(logout);
  const previewLogin = formatMinutesLabel(
    customShift && customLoginMinutes != null ? customLoginMinutes : companySettings.loginMinutes,
    companySettings.timeZone
  );
  const previewLogout = formatMinutesLabel(
    customShift && customLogoutMinutes != null ? customLogoutMinutes : companySettings.logoutMinutes,
    companySettings.timeZone
  );
  const overnight =
    customShift && customLoginMinutes != null && customLogoutMinutes != null
      ? shiftSpansMidnight({
          ...companySettings,
          loginMinutes: customLoginMinutes,
          logoutMinutes: customLogoutMinutes,
        })
      : shiftSpansMidnight(companySettings);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <h3 className="text-sm font-semibold">Shift timing</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Set this employee&apos;s login and logout. Late, productive time, and shift end follow these times
          ({timeZoneShort(companySettings.timeZone)}). Leave off to use the company shift from Work settings.
        </p>
      </div>
      <label className="flex items-start gap-3 rounded-sm border bg-muted/40 px-3 py-3 sm:col-span-2">
        <input
          type="checkbox"
          name="customShift"
          value="true"
          checked={customShift}
          onChange={(event) => setCustomShift(event.target.checked)}
          className="mt-0.5 size-4 rounded border-input"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium">Custom login / logout for this employee</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Company default: {formatMinutesLabel(companySettings.loginMinutes, companySettings.timeZone)} –{" "}
            {formatMinutesLabel(companySettings.logoutMinutes, companySettings.timeZone)}
          </span>
        </span>
      </label>
      {customShift ? (
        <>
          <div className="grid gap-2">
            <Label htmlFor="login">Login time</Label>
            <Input
              id="login"
              name="login"
              type="time"
              required
              value={login}
              onChange={(event) => setLogin(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="logout">Logout time</Label>
            <Input
              id="logout"
              name="logout"
              type="time"
              required
              value={logout}
              onChange={(event) => setLogout(event.target.value)}
            />
          </div>
        </>
      ) : null}
      <p className="text-xs text-muted-foreground sm:col-span-2">
        Effective shift: {previewLogin} – {previewLogout}
        {overnight ? " (overnight)" : ""}. Signing in after login is marked Late.
        {savedSchedule?.updatedAt
          ? ` Last assigned/updated ${formatDateTime(savedSchedule.updatedAt)}.`
          : customShift
            ? " Save to record when this shift was assigned."
            : ""}
      </p>
      {state.error ? <p className="text-sm text-destructive sm:col-span-2">{state.error}</p> : null}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save shift
        </Button>
      </div>
    </form>
  );
}
