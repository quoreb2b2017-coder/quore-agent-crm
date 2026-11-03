"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicShell } from "@/components/layout/public-shell";
import { createClient } from "@/lib/supabase/client";
import { postLoginPath, readWorktrackJwtClaims } from "@/lib/auth/jwt-claims";
import { MFA_ENFORCED } from "@/lib/auth/mfa-flags";

/** Second step of sign-in for accounts with two-factor turned on. */
export default function VerifyPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        window.location.assign("/login");
        return;
      }
      // TEMP: two-factor paused — skip verify and continue to the app.
      if (!MFA_ENFORCED) {
        const claims = readWorktrackJwtClaims(session.session.access_token);
        window.location.assign(postLoginPath(claims.roleKey));
        return;
      }
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2" || aal?.nextLevel !== "aal2") {
        const claims = readWorktrackJwtClaims(session.session.access_token);
        window.location.assign(postLoginPath(claims.roleKey));
        return;
      }
      const { data } = await supabase.auth.mfa.listFactors();
      const totp = data?.totp?.find((factor) => factor.status === "verified");
      setFactorId(totp?.id ?? null);
      setLoading(false);
      inputRef.current?.focus();
    })();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    if (verifyError) {
      setError("That code did not work. Check the time on your phone and try the newest code.");
      setBusy(false);
      return;
    }
    const { data } = await supabase.auth.getSession();
    const claims = readWorktrackJwtClaims(data.session?.access_token);
    window.location.assign(postLoginPath(claims.roleKey));
  }

  async function signInAsSomeoneElse() {
    await createClient().auth.signOut();
    window.location.assign("/login");
  }

  return (
    <PublicShell>
      <div className="flex flex-1 items-center justify-center bg-canvas px-4 py-16">
        <form onSubmit={submit} className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
          <span className="flex size-10 items-center justify-center rounded-lg bg-mint-soft text-primary">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Enter your sign-in code</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Open your authenticator app and type the 6-digit code for WorkTrack.
          </p>
          {loading ? (
            <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Checking your account…
            </p>
          ) : factorId ? (
            <div className="mt-6 flex flex-col gap-2">
              <Label htmlFor="code">6-digit code</Label>
              <Input
                ref={inputRef}
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                className="h-11 font-mono text-lg tracking-[0.3em]"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "code-error" : undefined}
              />
              {error ? (
                <p id="code-error" role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <Button type="submit" className="mt-2 h-10" disabled={busy || code.length !== 6}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Verify and continue
              </Button>
            </div>
          ) : (
            <p className="mt-6 text-sm text-destructive">
              No authenticator is set up for this account. Ask a Super Admin to reset two-factor sign-in.
            </p>
          )}
          <button type="button" onClick={signInAsSomeoneElse} className="mt-4 text-sm font-medium text-primary hover:underline">
            Sign in with a different account
          </button>
        </form>
      </div>
    </PublicShell>
  );
}
