"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  MoreHorizontal,
  User,
  Ban,
  Unlock,
  Loader2,
  Wallet,
  History,
  ClipboardCheck,
  Archive,
  ArchiveRestore,
  ShieldPlus,
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
import { makeSuperAdmin, setEmployeeBlocked, setEmployeeDisabled } from "./actions";

export const MAKE_SUPER_ADMIN_WARNING = (name: string) =>
  `Make ${name} a Super Admin?\n\nThey will be able to see and change everything: salaries, roles, every employee and the audit log. ` +
  `Their own shift clock and payroll stop, like yours. Every Super Admin gets a security alert.\n\n` +
  `To undo it, put them back into a team from Teams.`;

/** No delete: Archive takes the person off the list and keeps every record (attendance, salary, audit). */
export function EmployeeRowActions({
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
          title={isSelf ? "You cannot archive your own account" : undefined}
          onClick={() => {
            if (!isSelf) runDisable(!isDisabled);
          }}
        >
          {isDisabled ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
          {isDisabled ? "Restore" : "Archive"}
        </DropdownMenuItem>
        {canMakeSuperAdmin ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={runMakeSuperAdmin}>
              <ShieldPlus className="size-4" />
              Make Super Admin
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
