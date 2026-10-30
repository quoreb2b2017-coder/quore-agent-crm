"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, LogOut, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

type Factor = { id: string; friendly_name?: string | null; status: string; created_at: string };
type Enrolment = { factorId: string; qr: string; secret: string };

export function MfaManager({ required }: { required: boolean }) {
  const [loading, setLoading] = useState(true);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp ?? []) as Factor[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const verified = factors.filter((factor) => factor.status === "verified");
  const on = verified.length > 0;

  async function start() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    // A set-up that was started but never confirmed (page closed, wrong code,
    // browser refreshed) stays on the account as an "unverified" factor.
    // listFactors().totp only returns VERIFIED factors, so look at .all and
    // remove the leftovers before issuing a new QR code.
    const { data: listed } = await supabase.auth.mfa.listFactors();
    for (const factor of (listed?.all ?? []).filter((f) => f.factor_type === "totp" && f.status !== "verified")) {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
    // Supabase requires a unique name per factor, so include time and a short random tag.
    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    const tag = Math.random().toString(36).slice(2, 6).toUpperCase();
    const { data, error: enrolError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `WorkTrack ${stamp} ${tag}`,
      // Name shown in the authenticator app. Without it Supabase uses the
      // project's Site URL (often still "localhost:3000").
      issuer: "WorkTrack by Quore",
    });
    setBusy(false);
    if (enrolError || !data) {
      setError(enrolError?.message ?? "Could not start set-up. Try again.");
      return;
    }
    setEnrolment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    if (!enrolment) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrolment.factorId,
      code: code.trim(),
    });
    setBusy(false);
    if (verifyError) {
      setError("That code did not work. Use the newest code from the app.");
      return;
    }
    setEnrolment(null);
    setCode("");
    toast.success("Two-factor sign-in is on");
    await refresh();
    window.location.reload();
  }

  async function cancel() {
    if (enrolment) await createClient().auth.mfa.unenroll({ factorId: enrolment.factorId });
    setEnrolment(null);
    setCode("");
    setError(null);
    await refresh();
  }

  async function remove(factorId: string) {
    if (required && verified.length === 1) {
      toast.error("Your role requires two-factor sign-in. Add a new authenticator before removing this one.");
      return;
    }
    setBusy(true);
    const { error: removeError } = await createClient().auth.mfa.unenroll({ factorId });
    setBusy(false);
    if (removeError) {
      toast.error(removeError.message);
      return;
    }
    toast.success("Authenticator removed");
    await refresh();
    window.location.reload();
  }

  async function signOutOthers() {
    setBusy(true);
    const { error: signOutError } = await createClient().auth.signOut({ scope: "others" });
    setBusy(false);
    if (signOutError) toast.error(signOutError.message);
    else toast.success("Signed out of every other browser and device");
  }

  return (
    <div className="flex flex-col gap-5">
      <section
        aria-labelledby="mfa-heading"
        className={`rounded-xl border bg-card p-5 ${on ? "" : "border-[#fecdca]"}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-xl">
            <h2 id="mfa-heading" className="text-base font-semibold">Two-factor sign-in</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              After your password, WorkTrack asks for a 6-digit code from an authenticator app on your phone.
              {required ? " It is required for Super Admin and HR (ISO A.8.5, SOC 2 CC6.1)." : ""}
            </p>
          </div>
          <span className="wt-pill" data-tone={loading ? "neutral" : on ? "success" : "danger"}>
            {loading ? "Checking…" : on ? "On" : "Off"}
          </span>
        </div>

        {!loading && !enrolment ? (
          <div className="mt-4 flex flex-col gap-3">
            {verified.map((factor) => (
              <div key={factor.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
                <Smartphone className="size-4 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">{factor.friendly_name || "Authenticator app"}</span>
                  <span className="block text-xs text-muted-foreground">
                    Added {new Date(factor.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </span>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => remove(factor.id)}>
                  <ShieldOff className="size-3.5" /> Remove
                </Button>
              </div>
            ))}
            {!on ? (
              <Button className="self-start" disabled={busy} onClick={start}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                Set up with an authenticator app
              </Button>
            ) : null}
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          </div>
        ) : null}

        {enrolment ? (
          <form onSubmit={confirm} className="mt-4 flex flex-wrap gap-6 rounded-lg bg-muted/50 p-4">
            {/* Supabase returns the QR code as an SVG data URL. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enrolment.qr} alt="QR code to scan with your authenticator app" className="size-40 rounded-md border bg-white p-2" />
            <div className="flex min-w-[240px] flex-1 flex-col gap-3">
              <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground/90">
                <li>Open Google Authenticator, Microsoft Authenticator or 1Password.</li>
                <li>Scan the code, or type this key: <code className="rounded bg-card px-1.5 py-0.5 font-mono text-xs break-all">{enrolment.secret}</code></li>
                <li>Enter the 6-digit code the app shows.</li>
              </ol>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mfa-code">6-digit code</Label>
                <Input
                  id="mfa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                  className="h-10 w-40 font-mono text-base tracking-[0.25em]"
                  aria-invalid={Boolean(error)}
                />
              </div>
              {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={cancel} disabled={busy}>Cancel</Button>
                <Button type="submit" disabled={busy || code.length !== 6}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                  Verify and turn on
                </Button>
              </div>
            </div>
          </form>
        ) : null}
      </section>

      <section aria-labelledby="sessions-heading" className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-xl">
            <h2 id="sessions-heading" className="text-base font-semibold">Other browsers and devices</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Lost a phone or used a shared computer? Sign out everywhere except this browser.
            </p>
          </div>
          <Button variant="outline" className="border-[#fecdca] text-destructive hover:bg-[#fef3f2] hover:text-destructive" disabled={busy} onClick={signOutOthers}>
            <LogOut className="size-4" /> Sign out everywhere else
          </Button>
        </div>
      </section>
    </div>
  );
}
