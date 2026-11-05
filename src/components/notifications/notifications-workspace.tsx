"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { formatRelativeTime } from "@/lib/format";
import { listSentNotifications } from "@/lib/actions/notifications";
import { sheetCellClassName, sheetHeadClassName, sheetRowClassName } from "@/lib/sheet-styles";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotificationInbox, typeMeta, type InboxNotification } from "@/components/notifications/notification-inbox";
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
  employeeIdByName,
}: {
  inbox: InboxNotification[];
  canManage: boolean;
  employeeIdByName?: Record<string, string>;
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
      <div className="flex flex-col gap-4 pb-8">
        <PageHeader title="Notifications" description="Your alerts, meetings, and messages." />
        <NotificationInbox initialItems={inbox} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      <PageHeader
        title="Notifications"
        description="Logins, meetings, and messages. Filter the list, or send one to the team."
        actions={<SendNotificationDialog />}
      />
      <Tabs
        defaultValue="inbox"
        onValueChange={(value) => {
          if (value === "sent") loadSent();
        }}
      >
        <TabsList className="rounded-sm [&>button]:rounded-sm">
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
          <TabsTrigger value="sent">Sent</TabsTrigger>
        </TabsList>
        <TabsContent value="inbox" className="mt-2">
          <NotificationInbox initialItems={inbox} employeeIdByName={employeeIdByName} />
        </TabsContent>
        <TabsContent value="sent" className="mt-2">
          {isPending && !sent ? (
            <div className="flex items-center justify-center border bg-card py-16 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : !sent || sent.length === 0 ? (
            <div className="border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
              No messages sent yet
            </div>
          ) : (
            <div className="border bg-card">
              <div className="[&>[data-slot=table-container]]:max-h-[calc(100svh-16rem)]">
                <Table className="border-separate border-spacing-0">
                  <TableHeader className="sticky top-0 z-10">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={cn(sheetHeadClassName, "w-24")}>Type</TableHead>
                      <TableHead className={sheetHeadClassName}>Notification</TableHead>
                      <TableHead className={sheetHeadClassName}>Sent to</TableHead>
                      <TableHead className={cn(sheetHeadClassName, "w-28 border-r-0")}>Sent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sent.map((row) => {
                      const meta = typeMeta(row.type);
                      return (
                        <TableRow key={row.id} className={sheetRowClassName}>
                          <TableCell className={sheetCellClassName}>
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold",
                                meta.tone
                              )}
                            >
                              <meta.Icon className="size-3" aria-hidden />
                              {meta.label}
                            </span>
                          </TableCell>
                          <TableCell className={cn(sheetCellClassName, "min-w-56 font-medium whitespace-normal")}>
                            {row.title}
                          </TableCell>
                          <TableCell className={cn(sheetCellClassName, "whitespace-normal text-muted-foreground")}>
                            {row.recipient}
                          </TableCell>
                          <TableCell className={cn(sheetCellClassName, "border-r-0 text-muted-foreground")}>
                            {formatRelativeTime(row.createdAt)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <p className="border-t bg-muted px-3 py-1.5 text-xs text-muted-foreground tabular-nums">
                <span className="font-semibold text-foreground">{sent.length}</span> recent
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
