"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resetEmployeeMfa } from "./security-actions";

export function ResetMfaButton({ employeeId, name }: { employeeId: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Remove ${name}'s authenticator and sign them out everywhere? They will set it up again at next sign-in.`)) return;
        start(async () => {
          const res = await resetEmployeeMfa(employeeId);
          if (res.error) toast.error(res.error);
          else {
            toast.success("Two-factor sign-in reset");
            router.refresh();
          }
        });
      }}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
      Reset two-factor
    </Button>
  );
}
