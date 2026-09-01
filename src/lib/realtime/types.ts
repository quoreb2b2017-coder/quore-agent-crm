import type { ChatMessage } from "@/lib/chat/types";

export type RealtimeNotification = {
  id: string;
  employeeId: string;
  title: string;
  body: string | null;
  type: string;
  createdAt: string;
};

export type RecentNotification = {
  id: string;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: string;
};

export type ChatRealtimeMessage = ChatMessage & {
  senderName: string;
  participantA: string;
  participantB: string;
};

export type ChatReadEvent = {
  conversationId: string;
  readerId: string;
  readAt: string;
};

export type PresenceUpdate = {
  employeeId: string;
  online: boolean;
};
