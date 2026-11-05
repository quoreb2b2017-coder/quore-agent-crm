"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  MoreHorizontal,
  User,
  Ban,
  Unlock,
  Trash2,
  Loader2,
  Wallet,
  History,
  ClipboardCheck,
  UserCheck,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteEmployee, setEmployeeBlocked, setEmployeeDisabled } from "./actions";

export function EmployeeRowActions({
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
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" disabled={isPending} aria-label="Employee actions">
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link href={`/admin/employees/${employeeId}`}>
            <History className="size-4" />
            History
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/admin/employees/${employeeId}?tab=profile`}>
            <User className="size-4" />
            Go to profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/admin/onboarding/${employeeId}`}>
            <ClipboardCheck className="size-4" />
            Onboarding
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/admin/payroll?employee=${employeeId}`}>
            <Wallet className="size-4" />
            Setup payroll
          </Link>
        </DropdownMenuItem>
        {isDisabled ? null : (
          <DropdownMenuItem
            disabled={isSelf}
            title={isSelf ? "You cannot block your own account" : undefined}
            onClick={() => {
              if (isSelf) return;
              const nextBlocked = !isBlocked;
              if (
                nextBlocked &&
                !window.confirm(`Block ${fullName}? They will not be able to sign in until you unblock them.`)
              ) {
                return;
              }
              runBlock(nextBlocked);
            }}
          >
            {isBlocked ? <Unlock className="size-4" /> : <Ban className="size-4" />}
            {isBlocked ? "Unblock" : "Block"}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          disabled={isSelf}
          title={isSelf ? "You cannot disable your own account" : undefined}
          onClick={() => {
            if (!isSelf) runDisable(!isDisabled);
          }}
        >
          {isDisabled ? <UserCheck className="size-4" /> : <UserX className="size-4" />}
          {isDisabled ? "Enable" : "Disable"}
        </DropdownMenuItem>
        {canDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={isSelf}
              title={isSelf ? "You cannot delete your own account" : undefined}
              onClick={runDelete}
            >
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
