"use client";

import { useEffect } from "react";
import { ShieldOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PublicShell } from "@/components/layout/public-shell";

export function BlockedAccountGate() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      if (!cancelled) {
        window.location.replace("/login?reason=blocked");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PublicShell>
      <div className="bg-app-canvas flex flex-1 flex-col items-center justify-center p-6">
        <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border bg-card p-6 text-center shadow-sm">
          <div className="flex size-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <ShieldOff className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Account blocked</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This account cannot sign in. Contact Super Admin if you need access.
            </p>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
