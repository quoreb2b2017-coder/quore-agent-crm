"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runAutomatedControlChecks } from "./actions";

export function RunChecksButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const res = await runAutomatedControlChecks();
          if (res.error) {
            toast.error(res.error);
            return;
          }
          const failed = (res.results ?? []).filter((r) => r.result !== "PASS").length;
          if (failed > 0) toast.warning(`${failed} of ${res.results?.length ?? 0} checks need attention`);
          else toast.success("All automated checks passed");
        })
      }
    >
      {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
      Run automated checks
    </Button>
  );
}
