"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { verifyAuditChain, type VerifyResult } from "./actions";

export function VerifyChainButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<VerifyResult | null>(null);
  return (
    <div className="flex max-w-md flex-col items-end gap-1.5">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const next = await verifyAuditChain();
            setResult(next);
            if (next.ok || (next.synced && next.synced > 0) || (next.sealed && next.sealed > 0)) {
              router.refresh();
            }
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
        Verify integrity
      </Button>
      {result ? (
        <p
          role="status"
          className={
            result.ok && !result.needsSealSql
              ? "flex items-start gap-1.5 text-[13px] text-success"
              : "flex items-start gap-1.5 text-[13px] text-destructive"
          }
        >
          {result.ok && !result.needsSealSql ? (
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
          ) : (
            <ShieldX className="mt-0.5 size-3.5 shrink-0" />
          )}
          <span>
            {result.error
              ? result.error
              : result.ok
                ? [
                    result.synced
                      ? `Synced ${result.synced.toLocaleString("en-IN")} live rows.`
                      : null,
                    result.sealed
                      ? `Sealed ${result.sealed.toLocaleString("en-IN")} entries.`
                      : null,
                    result.checked
                      ? `Chain intact · ${result.checked.toLocaleString("en-IN")} sealed entries checked`
                      : "Chain ready · older rows are unsealed; new changes are hashed from now on",
                  ]
                    .filter(Boolean)
                    .join(" ")
                : `${result.problems?.length} problem(s), first at entry #${result.problems?.[0]?.seq}: ${result.problems?.[0]?.reason}`}
          </span>
        </p>
      ) : null}
    </div>
  );
}
