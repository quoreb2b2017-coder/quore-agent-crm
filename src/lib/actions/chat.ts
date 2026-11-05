"use server";

import { createDataClient as createClient } from "@/lib/supabase/data";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { emitToEmployees } from "@/lib/realtime/emit";
import { getChatPreviews, getChatUnreadTotal } from "@/lib/queries/chat";
import { chatPair } from "@/lib/chat/types";
import {
  deliverChatMessage,
  loadChatMessages,
  requireChatPeer,
  signedUrlForMessage,
} from "@/lib/chat/send";

export async function getChatUnreadCount() {
  try {
    const ctx = await getCurrentEmployeeContext();
    if (!ctx) return 0;
    return await getChatUnreadTotal(ctx.employeeId);
  } catch {
    return 0;
  }
}

export async function getChatThread(peerEmployeeId: string) {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { error: "Sign in to chat", conversationId: null, messages: [], peerLastReadAt: null };

  const peer = await requireChatPeer(ctx.employeeId, peerEmployeeId);
  if (peer.error) {
    return { error: peer.error, conversationId: null, messages: [], peerLastReadAt: null };
  }

  const supabase = await createClient();
  const [a, b] = chatPair(ctx.employeeId, peerEmployeeId);
  const { data: convo } = await supabase
    .from("chat_conversations")
    .select("id")
    .eq("participant_a", a)
    .eq("participant_b", b)
    .maybeSingle();

  if (!convo) {
    return { conversationId: null, messages: [], peerLastReadAt: null };
  }

  const [{ data: readRow }, messages] = await Promise.all([
    supabase
      .from("chat_reads")
      .select("last_read_at")
      .eq("conversation_id", convo.id)
      .eq("employee_id", peerEmployeeId)
      .maybeSingle(),
    loadChatMessages(convo.id),
  ]);

  return {
    conversationId: convo.id,
    messages,
    peerLastReadAt: readRow?.last_read_at ?? null,
  };
}

/** The heartbeat runs every 20 seconds, and browsers slow it down in background tabs. */
const ONLINE_WINDOW_MS = 90_000;

/** What changed since the last look: conversations, who is online, and how far the open chat's peer got. */
export async function getChatUpdates(peerEmployeeId: string | null) {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { previews: [], onlineIds: [], peerLastReadAt: null, peerLastSeenAt: null };

  const previews = await getChatPreviews(ctx.employeeId);
  const open = peerEmployeeId ? previews.find((row) => row.peerId === peerEmployeeId) : null;

  const supabase = await createClient();
  const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();
  const [{ data: seenRows }, peerSeen, peerRead] = await Promise.all([
    supabase.from("employee_presence").select("employee_id").gte("last_seen_at", onlineSince),
    open
      ? supabase.from("employee_presence").select("last_seen_at").eq("employee_id", open.peerId).maybeSingle()
      : null,
    open
      ? supabase
          .from("chat_reads")
          .select("last_read_at")
          .eq("conversation_id", open.conversationId)
          .eq("employee_id", open.peerId)
          .maybeSingle()
      : null,
  ]);

  return {
    previews,
    onlineIds: (seenRows ?? []).map((row) => row.employee_id),
    peerLastReadAt: peerRead?.data?.last_read_at ?? null,
    peerLastSeenAt: peerSeen?.data?.last_seen_at ?? null,
  };
}

export async function sendChatMessage(peerEmployeeId: string, body: string) {
  return deliverChatMessage({ peerEmployeeId, body });
}

export async function getChatAttachmentUrl(messageId: string) {
  return signedUrlForMessage(messageId);
}

export async function markChatRead(peerEmployeeId: string): Promise<{
  error?: string;
  conversationId?: string;
  readAt?: string;
}> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { error: "Sign in to chat" };
  if (!peerEmployeeId || peerEmployeeId === ctx.employeeId) return {};

  const supabase = await createClient();
  const [a, b] = chatPair(ctx.employeeId, peerEmployeeId);
  const { data: convo } = await supabase
    .from("chat_conversations")
    .select("id, participant_a, participant_b")
    .eq("participant_a", a)
    .eq("participant_b", b)
    .maybeSingle();

  if (!convo) return {};

  const readAt = new Date().toISOString();
  const unreadPatch =
    convo.participant_a === ctx.employeeId ? { unread_a: 0 } : { unread_b: 0 };

  const [{ error: readError }, { error: unreadError }] = await Promise.all([
    supabase.from("chat_reads").upsert({
      conversation_id: convo.id,
      employee_id: ctx.employeeId,
      last_read_at: readAt,
    }),
    supabase.from("chat_conversations").update(unreadPatch).eq("id", convo.id),
  ]);

  if (readError) return { error: readError.message };
  if (unreadError) return { error: unreadError.message };

  await emitToEmployees([peerEmployeeId], "chat:read", {
    conversationId: convo.id,
    readerId: ctx.employeeId,
    readAt,
  });

  return { conversationId: convo.id, readAt };
}
