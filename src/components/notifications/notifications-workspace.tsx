"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { formatRelativeTime } from "@/lib/format";
import { listSentNotifications } from "@/lib/actions/notifications";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotificationInbox, type InboxNotification } from "@/components/notifications/notification-inbox";
import { SendNotificationDialog } from "@/app/(admin)/admin/notifications/send-notification-dialog";
import { PageHeader } from "@/components/dashboard/page-header";

type SentRow = {
  id: string;
  title: string;
  type: string;
  createdAt: string;
  recipient: string;
};

export function NotificationsWorkspace({
  inbox,
  canManage,
}: {
  inbox: InboxNotification[];
  canManage: boolean;
}) {
  const [sent, setSent] = useState<SentRow[] | null>(null);
  const [isPending, startTransition] = useTransition();

  function loadSent() {
    if (sent) return;
    startTransition(async () => {
      setSent(await listSentNotifications());
    });
  }

  if (!canManage) {
    return (
      <div className="flex flex-col gap-6 pb-8">
        <PageHeader title="Notifications" description="Updates and alerts for your account" />
        <NotificationInbox initialItems={inbox} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        title="Notifications"
        description="Login alerts and messages for your team"
        actions={<SendNotificationDialog />}
      />
      <Tabs
        defaultValue="inbox"
        onValueChange={(value) => {
          if (value === "sent") loadSent();
        }}
      >
        <TabsList>
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
          <TabsTrigger value="sent">Sent</TabsTrigger>
        </TabsList>
        <TabsContent value="inbox" className="mt-4">
          <NotificationInbox initialItems={inbox} />
        </TabsContent>
        <TabsContent value="sent" className="mt-4">
          {isPending && !sent ? (
            <div className="flex items-center justify-center rounded-2xl border bg-card py-16 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : !sent || sent.length === 0 ? (
            <div className="rounded-2xl border bg-card px-6 py-16 text-center text-sm text-muted-foreground shadow-sm">
              No messages sent yet
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="border-b bg-muted/30 px-5 py-3.5">
                <p className="text-sm font-semibold tracking-tight">Sent messages</p>
                <p className="text-xs text-muted-foreground">{sent.length} recent</p>
              </div>
              <ul className="divide-y">
                {sent.map((row) => (
                  <li key={row.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">To {row.recipient}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                      {formatRelativeTime(row.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
