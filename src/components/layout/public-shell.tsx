import Link from "next/link";
import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { DualOfficeClocks } from "@/components/layout/live-time";
import { shiftWindowLabel, usShiftWindowLabel } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/85 shadow-sm backdrop-blur-md">
        <div className="flex h-16 w-full items-center gap-3 px-4 sm:px-6">
          <Link href="/login" className="group flex shrink-0 items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition group-hover:scale-105">
              <ShieldCheck className="size-4" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight">WorkTrack</p>
              <p className="hidden text-[11px] text-muted-foreground sm:block">Employee workspace</p>
            </div>
          </Link>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <DualOfficeClocks pills />
            <Badge
              variant="outline"
              title={shiftWindowLabel()}
              className="hidden h-7 max-w-[18rem] truncate border-primary/20 bg-primary/5 px-2.5 text-[11px] font-medium text-primary md:inline-flex"
            >
              Shift {usShiftWindowLabel()}
            </Badge>
            <span className="hidden h-7 items-center rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground sm:inline-flex">
              Sign in
            </span>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">{children}</main>

      <footer className="border-t bg-background/90">
        <div className="flex w-full flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <span>© {new Date().getFullYear()} WorkTrack. All rights reserved.</span>
          <span>Accounts are created by your organization&apos;s administrator.</span>
        </div>
      </footer>
    </div>
  );
}
