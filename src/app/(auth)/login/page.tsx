"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Clock,
  Radio,
  Wallet,
  Sparkles,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicShell } from "@/components/layout/public-shell";
import { ClientGreeting, DualOfficeClocks, ShiftCountdown } from "@/components/layout/live-time";
import { shiftWindowLabel } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { postLoginPath, readWorktrackJwtClaims } from "@/lib/auth/jwt-claims";

const HIGHLIGHTS = [
  { icon: Clock, text: "Sign in and attendance is marked. US hours follow India 6:30 PM – 3:30 AM IST · tea 30 min · lunch 45 min" },
  { icon: Radio, text: "See live status across your team in real time" },
  { icon: Wallet, text: "Access salary slips, leave, and tasks in one place" },
];

export default function LoginPage() {
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [spot, setSpot] = useState({ x: 70, y: 20 });
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  useEffect(() => {
    emailRef.current?.focus();
    const reason = new URLSearchParams(window.location.search).get("reason");
    if (reason === "blocked") {
      setError("This account is blocked. Contact Super Admin.");
    }
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsPending(true);

    const formData = new FormData(e.currentTarget);
    const emailValue = (
      emailRef.current?.value ||
      String(formData.get("email") || "") ||
      email
    ).trim();
    const passwordValue = (
      passwordRef.current?.value || String(formData.get("password") || "")
    ).replace(/\r?\n/g, "");

    if (!emailValue || !passwordValue) {
      setError("Email or password was empty. Type both fields, then Continue.");
      setIsPending(false);
      return;
    }

    if (passwordValue.length < 4) {
      setError("Password must be at least 4 characters.");
      setIsPending(false);
      return;
    }

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: emailValue,
      password: passwordValue,
    });

    if (signInError) {
      const message = signInError.message.toLowerCase();
      setError(
        signInError.message === "Invalid login credentials"
          ? "Invalid email or password."
          : message.includes("banned") || message.includes("blocked")
            ? "This account is blocked. Contact Super Admin."
            : signInError.message
      );
      setIsPending(false);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const claims = readWorktrackJwtClaims(sessionData.session?.access_token);
    router.replace(postLoginPath(claims.roleKey));
  }

  return (
    <PublicShell>
      <div className="grid flex-1 lg:grid-cols-2">
        <div
          className="bg-hero-mesh relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setSpot({
              x: ((e.clientX - rect.left) / rect.width) * 100,
              y: ((e.clientY - rect.top) / rect.height) * 100,
            });
          }}
        >
          <div className="bg-hero-grid pointer-events-none absolute inset-0" aria-hidden />
          <div
            className="pointer-events-none absolute size-80 rounded-full bg-white/15 blur-3xl transition-transform duration-200"
            style={{ left: `calc(${spot.x}% - 10rem)`, top: `calc(${spot.y}% - 10rem)` }}
            aria-hidden
          />
          <div
            className="animate-float pointer-events-none absolute top-24 right-10 size-40 rounded-full bg-sky-300/20 blur-2xl"
            aria-hidden
          />
          <div
            className="animate-float-delayed pointer-events-none absolute bottom-16 left-10 size-32 rounded-full bg-white/10 blur-2xl"
            aria-hidden
          />

          <div className="relative flex flex-col gap-4">
            <p className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium tracking-wide text-white/80 uppercase">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-70" />
                <span className="relative inline-flex size-2 rounded-full bg-success" />
              </span>
              Workspace is live
            </p>
            <DualOfficeClocks cards />
            <ShiftCountdown />
          </div>

          <div className="relative flex flex-col gap-6">
            <div>
              <p className="text-sm font-medium text-white/70">
                <ClientGreeting />
              </p>
              <h2 className="mt-1 max-w-md text-3xl font-semibold tracking-tight text-balance">
                Welcome to WorkTrack
              </h2>
              <p className="mt-3 max-w-sm text-sm text-white/75">
                One workspace for attendance, activity, tasks, and payroll. US office hours
                are {shiftWindowLabel()} — you can sign in any time.
              </p>
            </div>
            <ul className="flex flex-col gap-3">
              {HIGHLIGHTS.map((h) => (
                <li
                  key={h.text}
                  className="group flex items-start gap-3 rounded-xl border border-transparent p-2 text-sm text-white/80 transition hover:border-white/10 hover:bg-white/10"
                >
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 transition group-hover:scale-110 group-hover:bg-white/20">
                    <h.icon className="size-4" />
                  </div>
                  {h.text}
                </li>
              ))}
            </ul>
          </div>
          <p className="relative text-xs text-white/55">
            Accounts are created by your organization&apos;s administrator.
          </p>
        </div>

        <div className="bg-app-canvas flex flex-col items-center justify-center p-6 sm:p-10">
          <div className="flex w-full max-w-sm animate-in fade-in slide-in-from-bottom-3 flex-col gap-6 duration-500">
            <div className="flex items-center gap-2 text-sm text-muted-foreground lg:hidden">
              <Sparkles className="size-4 text-primary" />
              <ClientGreeting /> — welcome
            </div>

            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                <ClientGreeting />. You can sign in any time. Shift {shiftWindowLabel()}.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={emailRef}
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    autoFocus
                    required
                    placeholder="you@company.com"
                    className="h-11 bg-background pr-9 pl-9"
                    defaultValue=""
                    onInput={(e) => setEmail(e.currentTarget.value)}
                  />
                  {emailOk ? (
                    <CheckCircle2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-success" />
                  ) : null}
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={passwordRef}
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    minLength={4}
                    className="h-11 bg-background pr-10 pl-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              {error ? (
                <p className="animate-in fade-in slide-in-from-top-1 text-sm text-destructive duration-200">
                  {error}
                </p>
              ) : null}
              <Button type="submit" size="lg" className="group h-11 w-full" disabled={isPending}>
                {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Continue
                {isPending ? null : (
                  <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                )}
              </Button>
            </form>

            <p className="hidden text-center text-xs text-muted-foreground lg:block">
              Click a clock to copy the time
            </p>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
