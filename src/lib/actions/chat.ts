"use server";

import { createDataClient as createClient } from "@/lib/supabase/data";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { emitToEmployees } from "@/lib/realtime/emit";
import { getChatUnreadTotal } from "@/lib/queries/chat";
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
