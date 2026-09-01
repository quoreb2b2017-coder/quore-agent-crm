"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MoreHorizontal, Pencil, Ban, Unlock, Trash2, Loader2, Wallet, History } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteEmployee, setEmployeeBlocked } from "./actions";

export function EmployeeRowActions({
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
            <Pencil className="size-4" />
            Edit
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/admin/payroll?employee=${employeeId}`}>
            <Wallet className="size-4" />
            Setup payroll
          </Link>
        </DropdownMenuItem>
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
