"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { acceptMeeting, rejectMeeting } from "@/lib/actions/attendance";
import type { PendingMeetingRequest } from "@/lib/queries/admin-dashboard";
import { formatTime } from "@/lib/format";

export function MeetingRequests({ requests }: { requests: PendingMeetingRequest[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (requests.length === 0) return null;

  function run(action: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      const res = await action();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="border-b bg-info/8 px-4 py-3">
      <p className="mb-2 text-xs font-semibold tracking-wide text-info uppercase">
        Meeting requests · accept to start the timer
      </p>
      <ul className="flex flex-col gap-2">
        {requests.map((request) => (
          <li key={request.id} className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{request.fullName}</p>
              <p className="text-[11px] text-muted-foreground">
                {request.employeeCode} · requested {formatTime(request.requestedAt)}
              </p>
            </div>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                className="h-8"
                disabled={isPending}
                onClick={() => run(() => acceptMeeting(request.id))}
              >
                {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={isPending}
                onClick={() => run(() => rejectMeeting(request.id))}
              >
                <X className="size-3.5" />
                Reject
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
