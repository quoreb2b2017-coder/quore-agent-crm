"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionForm } from "@/hooks/use-action-form";
import { BREAK_BUDGET_LABEL, NATIVE_SELECT_CLASS, PRODUCTIVE_HOURS_LABEL } from "@/lib/shift";
import {
  TIME_ZONE_OPTIONS,
  formatMinutesLabel,
  minutesToTimeValue,
  shiftLengthMinutes,
  shiftSpansMidnight,
  timeValueToMinutes,
  timeZoneShort,
  type WorkSettings,
} from "@/lib/work-settings";
import { cn } from "@/lib/utils";
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
  const [timeZone, setTimeZone] = useState(settings.timeZone);
  const [login, setLogin] = useState(minutesToTimeValue(settings.loginMinutes));
  const [logout, setLogout] = useState(minutesToTimeValue(settings.logoutMinutes));
  const [leave, setLeave] = useState(String(settings.annualPaidLeaveDays));
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setTimeZone(settings.timeZone);
    setLogin(minutesToTimeValue(settings.loginMinutes));
    setLogout(minutesToTimeValue(settings.logoutMinutes));
    setLeave(String(settings.annualPaidLeaveDays));
  }, [settings.timeZone, settings.loginMinutes, settings.logoutMinutes, settings.annualPaidLeaveDays]);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const zones = TIME_ZONE_OPTIONS.some((zone) => zone.id === timeZone)
    ? TIME_ZONE_OPTIONS
    : [{ id: timeZone, label: timeZone }, ...TIME_ZONE_OPTIONS];
  const loginMinutes = timeValueToMinutes(login);
  const logoutMinutes = timeValueToMinutes(logout);
  const draft =
    loginMinutes != null && logoutMinutes != null
      ? {
          timeZone,
          loginMinutes,
          logoutMinutes,
          lateMinutes: (loginMinutes + 1) % (24 * 60),
          annualPaidLeaveDays: Number(leave) || 0,
        }
      : null;
  const overnight = draft ? shiftSpansMidnight(draft) : false;
  const length = draft ? shiftLengthMinutes(draft) : 0;
  const loginLabel = draft ? formatMinutesLabel(draft.loginMinutes, timeZone) : "—";
  const logoutLabel = draft ? formatMinutesLabel(draft.logoutMinutes, timeZone) : "—";
  const clock = now
    ? now.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
        timeZone,
      })
    : "—";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="rounded-xl border bg-muted/30 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Shift</p>
            <p className="mt-0.5 text-xl font-semibold tracking-tight">
              {loginLabel}
              <span className="px-1.5 text-muted-foreground">–</span>
              {logoutLabel}
            </p>
          </div>
          <p className="text-sm text-muted-foreground tabular-nums">
            {clock} {timeZoneShort(timeZone)}
          </p>
        </div>
        {draft ? <ShiftTrack login={draft.loginMinutes} logout={draft.logoutMinutes} /> : null}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Pill>{overnight ? "Overnight" : "Same day"}</Pill>
          <Pill>{formatLength(length)} on shift</Pill>
          <Pill>Late after {loginLabel}</Pill>
          <Pill>Target {PRODUCTIVE_HOURS_LABEL}</Pill>
        </div>
      </div>

      <section className="grid gap-2">
        <Label htmlFor="timeZone">Time zone</Label>
        <select
          id="timeZone"
          name="timeZone"
          value={timeZone}
          onChange={(event) => setTimeZone(event.target.value)}
          className={cn(NATIVE_SELECT_CLASS, "h-10")}
        >
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Login, logout, late, and which day a shift belongs to all use this zone.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="login">Login time</Label>
          <Input
            id="login"
            name="login"
            type="time"
            required
            className="h-10"
            value={login}
            onChange={(event) => setLogin(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Productive time starts here. Signing in earlier still shows the real time. Signing in after this is Late.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="logout">Logout time</Label>
          <Input
            id="logout"
            name="logout"
            type="time"
            required
            className="h-10"
            value={logout}
            onChange={(event) => setLogout(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {overnight
              ? "Logout is the next morning, so this shift crosses midnight."
              : "Logout is later the same day."}
          </p>
        </div>
      </section>

      <section className="grid max-w-xs gap-2">
        <Label htmlFor="annualPaidLeaveDays">Default paid leave / year</Label>
        <Input
          id="annualPaidLeaveDays"
          name="annualPaidLeaveDays"
          type="number"
          min={0}
          max={366}
          step="0.5"
          required
          className="h-10"
          value={leave}
          onChange={(event) => setLeave(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Used when someone has no custom balance. Change one person&apos;s remaining days on Leave. Breaks stay{" "}
          {BREAK_BUDGET_LABEL}.
        </p>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex items-center justify-end border-t pt-4">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save setup"}
        </Button>
      </div>
    </form>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-background px-2.5 py-1 text-[11px] font-medium text-foreground ring-1 ring-border">
      {children}
    </span>
  );
}

function ShiftTrack({ login, logout }: { login: number; logout: number }) {
  const day = 24 * 60;
  const parts =
    logout <= login
      ? [
          { left: (login / day) * 100, width: ((day - login) / day) * 100 },
          { left: 0, width: (logout / day) * 100 },
        ]
      : [{ left: (login / day) * 100, width: ((logout - login) / day) * 100 }];

  return (
    <div className="mt-4">
      <div className="relative h-2 overflow-hidden rounded-full bg-background">
        {parts.map((part) =>
          part.width <= 0 ? null : (
            <span
              key={`${part.left}-${part.width}`}
              className="absolute inset-y-0 rounded-full bg-primary"
              style={{ left: `${part.left}%`, width: `${part.width}%` }}
            />
          )
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>12 AM</span>
        <span>6 AM</span>
        <span>12 PM</span>
        <span>6 PM</span>
        <span>12 AM</span>
      </div>
    </div>
  );
}

function formatLength(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}
