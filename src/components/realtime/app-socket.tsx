"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type {
  ChatRealtimeMessage,
  PresenceUpdate,
  RealtimeNotification,
} from "@/lib/realtime/types";

function socketUrl() {
  return process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3002";
}

function chatOpenWith(senderId: string) {
  if (typeof window === "undefined") return false;
  if (!window.location.pathname.includes("/chat")) return false;
  return new URLSearchParams(window.location.search).get("with") === senderId;
}

type AppSocketValue = {
  socket: Socket | null;
  connected: boolean;
  onlineIds: Set<string>;
};

const AppSocketContext = createContext<AppSocketValue>({
  socket: null,
  connected: false,
  onlineIds: new Set(),
});

export function useAppSocket() {
  return useContext(AppSocketContext);
}

export function AppSocketProvider({
  employeeId,
  children,
}: {
  employeeId: string;
  children: ReactNode;
}) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);

  useEffect(() => {
    let active: Socket | null = null;
    let cancelled = false;

    async function connect() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token || cancelled) return;

      active = io(socketUrl(), {
        auth: { token: session.access_token },
        transports: ["websocket", "polling"],
      });

      active.on("connect", () => setConnected(true));
      active.on("disconnect", () => setConnected(false));

      active.on("presence:snapshot", (ids: string[]) => {
        setOnlineIds(Array.isArray(ids) ? ids : []);
      });

      active.on("presence:update", (payload: PresenceUpdate) => {
        if (!payload?.employeeId) return;
        setOnlineIds((current) => {
          const next = new Set(current);
          if (payload.online) next.add(payload.employeeId);
          else next.delete(payload.employeeId);
          return Array.from(next);
        });
      });

      active.on("notification", (payload: RealtimeNotification) => {
        if (payload.employeeId !== employeeId) return;
        toast.info(payload.title, { description: payload.body || undefined });
        window.dispatchEvent(new Event("worktrack:notification"));
      });

      active.on("chat:message", (payload: ChatRealtimeMessage) => {
        window.dispatchEvent(new CustomEvent("worktrack:chat", { detail: payload }));
        if (!payload || payload.senderId === employeeId) return;
        if (chatOpenWith(payload.senderId)) return;
        toast(payload.senderName, {
          description: (payload.body || payload.attachment?.name || "Attachment").slice(0, 140),
        });
        window.dispatchEvent(new Event("worktrack:chat-unread"));
      });

      active.on("chat:read", (payload) => {
        window.dispatchEvent(new CustomEvent("worktrack:chat-read", { detail: payload }));
      });

      if (!cancelled) setSocket(active);
    }

    const timer = window.setTimeout(() => {
      void connect();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      active?.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [employeeId]);

  const value = useMemo<AppSocketValue>(
    () => ({
      socket,
      connected,
      onlineIds: new Set([...onlineIds, employeeId]),
    }),
    [socket, connected, onlineIds, employeeId]
  );

  return <AppSocketContext.Provider value={value}>{children}</AppSocketContext.Provider>;
}
