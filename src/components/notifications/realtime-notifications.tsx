"use client";

import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeNotification } from "@/lib/realtime/types";

function socketUrl() {
  return process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3002";
}

export function RealtimeNotifications({ employeeId }: { employeeId: string }) {
  useEffect(() => {
    let socket: Socket | null = null;
    let cancelled = false;

    async function connect() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token || cancelled) return;

      socket = io(socketUrl(), {
        auth: { token: session.access_token },
        transports: ["websocket", "polling"],
      });

      socket.on("notification", (payload: RealtimeNotification) => {
        if (payload.employeeId !== employeeId) return;
        toast.info(payload.title, { description: payload.body || undefined });
        window.dispatchEvent(new Event("worktrack:notification"));
      });
    }

    const timer = window.setTimeout(() => {
      void connect();
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      socket?.disconnect();
    };
  }, [employeeId]);

  return null;
}
