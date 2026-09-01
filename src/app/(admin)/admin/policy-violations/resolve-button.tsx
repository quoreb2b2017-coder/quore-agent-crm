"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolvePolicyViolation } from "@/lib/actions/policy-violations";

export function ResolveButton({ violationId }: { violationId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const res = await resolvePolicyViolation(violationId);
          if (res.error) toast.error(res.error);
          else toast.success("Marked resolved");
        })
      }
    >
      {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
      Resolve
    </Button>
  );
}
