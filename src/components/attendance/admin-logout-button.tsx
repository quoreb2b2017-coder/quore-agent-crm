"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logoutEmployeeByAdmin } from "@/lib/actions/attendance";

export function AdminLogoutButton({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      size="sm"
      variant="outline"
      className="text-destructive hover:text-destructive"
      disabled={isPending}
      onClick={() => {
        if (!window.confirm(`Log out ${employeeName}? Their timer stops now.`)) return;
        startTransition(async () => {
          const res = await logoutEmployeeByAdmin(employeeId);
          if (res.error) {
            toast.error(res.error);
            return;
          }
          toast.success(`${employeeName} logged out`);
          router.refresh();
        });
      }}
    >
      {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}
      Logout
    </Button>
  );
}
