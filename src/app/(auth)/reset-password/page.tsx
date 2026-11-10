"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { PublicShell } from "@/components/layout/public-shell";
import { createClient } from "@/lib/supabase/client";
import { reportBrowserAction } from "@/lib/actions/notifications";

const MIN_LENGTH = 8;

type State = "checking" | "ready" | "invalid" | "done";

/** Opened from the reset email. The browser client trades the link's code for a short session first. */
export default function ResetPasswordPage() {
  const [state, setState] = useState<State>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled) setState(data.session ? "ready" : "invalid");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setBusy(false);
      setError(updateError.message);
      return;
    }
    await reportBrowserAction("password").catch(() => undefined);
    // Sign in again with the new password, so the reset link's session does not carry on.
    await supabase.auth.signOut();
    setBusy(false);
    setState("done");
  }

  return (
    <PublicShell>
      <div className="flex flex-1 items-center justify-center bg-canvas px-4 py-16">
        <form onSubmit={submit} className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
          <span className="flex size-10 items-center justify-center rounded-lg bg-mint-soft text-primary">
            <KeyRound className="size-5" aria-hidden />
          </span>
          {state === "checking" ? (
            <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Checking your link…
            </p>
          ) : state === "invalid" ? (
            <>
              <h1 className="mt-4 text-xl font-semibold tracking-tight">This link does not work</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                It may have expired or already been used, or it was opened in a different browser from the one
                that asked for it. Ask for a new link.
              </p>
              <Button asChild className="mt-6 h-10 w-full">
                <Link href="/forgot-password">Send a new link</Link>
              </Button>
            </>
          ) : state === "done" ? (
            <>
              <h1 className="mt-4 text-xl font-semibold tracking-tight">Password changed</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">Sign in with your new password.</p>
              <Button asChild className="mt-6 h-10 w-full">
                <Link href="/login">Go to sign in</Link>
              </Button>
            </>
          ) : (
            <>
              <h1 className="mt-4 text-xl font-semibold tracking-tight">Set a new password</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">Use at least {MIN_LENGTH} characters.</p>
              <div className="mt-6 flex flex-col gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="password">New password</Label>
                  <PasswordInput
                    id="password"
                    autoComplete="new-password"
                    autoFocus
                    minLength={MIN_LENGTH}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="confirm">Type it again</Label>
                  <PasswordInput
                    id="confirm"
                    autoComplete="new-password"
                    minLength={MIN_LENGTH}
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                  />
                </div>
                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
                <Button type="submit" className="mt-1 h-10" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                  Save new password
                </Button>
              </div>
            </>
          )}
        </form>
      </div>
    </PublicShell>
  );
}
