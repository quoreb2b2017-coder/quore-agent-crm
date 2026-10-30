"use client";

import { useState, useTransition } from "react";
import { Loader2, ShieldCheck, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { verifyAuditChain, type VerifyResult } from "./actions";

export function VerifyChainButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<VerifyResult | null>(null);
  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button variant="outline" disabled={pending} onClick={() => start(async () => setResult(await verifyAuditChain()))}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
        Verify integrity
      </Button>
      {result ? (
        <p role="status" className={result.ok ? "flex items-center gap-1.5 text-[13px] text-success" : "flex items-center gap-1.5 text-[13px] text-destructive"}>
          {result.ok ? <ShieldCheck className="size-3.5" /> : <ShieldX className="size-3.5" />}
          {result.error
            ? result.error
            : result.ok
              ? `Chain intact · ${result.checked} sealed entries checked`
              : `${result.problems?.length} problem(s), first at entry #${result.problems?.[0]?.seq}: ${result.problems?.[0]?.reason}`}
        </p>
      ) : null}
    </div>
  );
}
