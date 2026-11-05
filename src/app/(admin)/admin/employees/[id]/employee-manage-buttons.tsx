"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Unlock, Trash2, Loader2, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteEmployee, setEmployeeBlocked, setEmployeeDisabled } from "../actions";

export function EmployeeManageButtons({
  employeeId,
  fullName,
  isBlocked,
  isDisabled,
  isSelf,
  canDelete,
}: {
  employeeId: string;
  fullName: string;
  isBlocked: boolean;
  isDisabled: boolean;
  isSelf: boolean;
  canDelete: boolean;
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

  function runDisable(disabled: boolean) {
    if (
      disabled &&
      !window.confirm(
        `Disable ${fullName}? They will leave the employee list and cannot sign in. Their attendance, salary and history are kept, and you can enable them again.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await setEmployeeDisabled(employeeId, disabled);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(disabled ? `${fullName} is disabled` : `${fullName} is enabled`);
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
      {isDisabled ? null : (
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
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending || isSelf}
        title={isSelf ? "You cannot disable your own account" : undefined}
        onClick={() => runDisable(!isDisabled)}
      >
        {isPending ? <Loader2 className="size-4 animate-spin" /> : isDisabled ? <UserCheck className="size-4" /> : <UserX className="size-4" />}
        {isDisabled ? "Enable" : "Disable"}
      </Button>
      {canDelete ? (
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
      ) : null}
    </div>
  );
}
