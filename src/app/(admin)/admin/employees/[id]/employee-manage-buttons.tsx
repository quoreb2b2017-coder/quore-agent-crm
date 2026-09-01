"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Unlock, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteEmployee, setEmployeeBlocked } from "../actions";

export function EmployeeManageButtons({
  employeeId,
  fullName,
  isBlocked,
  isSelf,
}: {
  employeeId: string;
  fullName: string;
  isBlocked: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function runBlock(blocked: boolean) {
    if (
      blocked &&
      !window.confirm(`Block ${fullName}? They will not be able to sign in until you unblock them.`)
    ) {
      return;
    }
    startTransition(async () => {
      const result = await setEmployeeBlocked(employeeId, blocked);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(blocked ? `${fullName} is blocked` : `${fullName} is unblocked`);
      router.refresh();
    });
  }

  function runDelete() {
    if (!window.confirm(`Delete ${fullName}? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteEmployee(employeeId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${fullName} deleted`);
      router.replace("/admin/employees");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending || isSelf}
        title={isSelf ? "You cannot block your own account" : undefined}
        onClick={() => runBlock(!isBlocked)}
      >
        {isPending ? <Loader2 className="size-4 animate-spin" /> : isBlocked ? <Unlock className="size-4" /> : <Ban className="size-4" />}
        {isBlocked ? "Unblock" : "Block"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={isPending || isSelf}
        title={isSelf ? "You cannot delete your own account" : undefined}
        onClick={runDelete}
      >
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        Delete
      </Button>
    </div>
  );
}
