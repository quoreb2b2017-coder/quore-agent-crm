"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Ban, Unlock, Loader2, ShieldPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { makeSuperAdmin, setEmployeeBlocked, setEmployeeDisabled } from "../actions";
import { MAKE_SUPER_ADMIN_WARNING } from "../employee-row-actions";

/** No delete: Archive takes the person off the list and keeps every record (attendance, salary, audit). */
export function EmployeeManageButtons({
  employeeId,
  fullName,
  isBlocked,
  isDisabled,
  isSelf,
  canMakeSuperAdmin,
}: {
  employeeId: string;
  fullName: string;
  isBlocked: boolean;
  isDisabled: boolean;
  isSelf: boolean;
  canMakeSuperAdmin: boolean;
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
        `Archive ${fullName}? They will leave the employee list and cannot sign in. Their attendance, salary and history are kept, and you can restore them any time.`
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
      toast.success(disabled ? `${fullName} is archived` : `${fullName} is restored`);
      router.refresh();
    });
  }

  function runMakeSuperAdmin() {
    if (!window.confirm(MAKE_SUPER_ADMIN_WARNING(fullName))) return;
    startTransition(async () => {
      const result = await makeSuperAdmin(employeeId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${fullName} is now a Super Admin`);
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
        title={isSelf ? "You cannot archive your own account" : undefined}
        onClick={() => runDisable(!isDisabled)}
      >
        {isPending ? <Loader2 className="size-4 animate-spin" /> : isDisabled ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
        {isDisabled ? "Restore" : "Archive"}
      </Button>
      {canMakeSuperAdmin ? (
        <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={runMakeSuperAdmin}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldPlus className="size-4" />}
          Make Super Admin
        </Button>
      ) : null}
    </div>
  );
}
