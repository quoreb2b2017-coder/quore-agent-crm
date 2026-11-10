"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicShell } from "@/components/layout/public-shell";
import { createClient } from "@/lib/supabase/client";

/** Sends a reset link. The answer is the same whether or not the email exists, so nobody can test addresses. */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Enter your work email.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: resetError } = await createClient().auth.resetPasswordForEmail(value, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    // Only a rate limit is worth showing; anything else would reveal whether the account exists.
    if (resetError && /rate|too many|seconds/i.test(resetError.message)) {
      setError("Too many requests. Wait a few minutes, then try again.");
      return;
    }
    setSent(true);
  }

  return (
    <PublicShell>
      <div className="flex flex-1 items-center justify-center bg-canvas px-4 py-16">
        <form onSubmit={submit} className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
          <span className="flex size-10 items-center justify-center rounded-lg bg-mint-soft text-primary">
            {sent ? <MailCheck className="size-5" aria-hidden /> : <KeyRound className="size-5" aria-hidden />}
          </span>
          {sent ? (
            <>
              <h1 className="mt-4 text-xl font-semibold tracking-tight">Check your email</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                If <span className="font-medium text-foreground">{email.trim()}</span> has a WorkTrack account, a
                link to set a new password is on its way. Open it in this same browser. It works once and expires
                in an hour.
              </p>
            </>
          ) : (
            <>
              <h1 className="mt-4 text-xl font-semibold tracking-tight">Forgot your password?</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Enter your work email and we will send you a link to set a new one.
              </p>
              <div className="mt-6 flex flex-col gap-2">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-11"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "email-error" : undefined}
                />
                {error ? (
                  <p id="email-error" role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
                <Button type="submit" className="mt-2 h-10" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                  Send reset link
                </Button>
              </div>
            </>
          )}
          <Link href="/login" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </form>
      </div>
    </PublicShell>
  );
}
