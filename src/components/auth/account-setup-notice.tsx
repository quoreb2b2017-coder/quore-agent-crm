"use client";

import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { PublicShell } from "@/components/layout/public-shell";

export function AccountSetupNotice({ email }: { email: string }) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <PublicShell>
      <div className="bg-app-canvas flex flex-1 flex-col items-center justify-center p-6">
        <div className="flex w-full max-w-lg flex-col gap-5 rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Account is signed in</h1>
            <p className="mt-2 text-sm text-muted-foreground text-pretty">
              <span className="font-medium text-foreground">{email}</span> is signed in, but the
              employee profile for this account could not be loaded.
            </p>
          </div>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Open the Supabase SQL Editor.</li>
            <li>
              Run <code className="text-foreground">scripts/create-super-admin.sql</code> again
              (it now unlocks Super Admin access without the Auth Hook).
            </li>
            <li>Refresh this page.</li>
          </ol>
          <Button variant="outline" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </div>
    </PublicShell>
  );
}
