"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getChatUnreadCount } from "@/lib/actions/chat";

export function ChatUnreadButton({ href }: { href: string }) {
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    setUnread(await getChatUnreadCount());
  }, []);

  useEffect(() => {
    void load();
    function onUnread() {
      setUnread((count) => count + 1);
    }
    window.addEventListener("worktrack:chat-unread", onUnread);
    window.addEventListener("worktrack:chat-read-self", load);
    return () => {
      window.removeEventListener("worktrack:chat-unread", onUnread);
      window.removeEventListener("worktrack:chat-read-self", load);
    };
  }, [load]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative size-8 rounded-full text-muted-foreground"
      aria-label="Chat"
      asChild
    >
      <Link href={href}>
        <MessageCircle className="size-4" />
        {unread > 0 ? (
          <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
