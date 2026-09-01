import { createDataClient as createClient } from "@/lib/supabase/data";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { emitToEmployees } from "@/lib/realtime/emit";
import {
  CHAT_ATTACHMENT_BUCKET,
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_MESSAGE_MAX,
  chatPair,
  chatRetentionSince,
  fileExtension,
  resolveChatMime,
  safeAttachmentName,
  type ChatAttachment,
  type ChatMessage,
} from "@/lib/chat/types";

export type ChatSendResult = {
  error?: string;
  message?: ChatMessage;
  conversationId?: string;
};

function chatDbError(message?: string | null) {
  if (message && /chat_conversations|chat_messages|chat-attachments|schema cache|does not exist/i.test(message)) {
    return "Chat is not set up yet. Apply supabase/migrations/0014_chat.sql and 0015_chat_attachments.sql in the Supabase SQL editor.";
  }
  return message || "Something went wrong";
}

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  attachment_path?: string | null;
  attachment_name?: string | null;
  attachment_mime?: string | null;
  attachment_size?: number | null;
};

export function mapChatMessage(row: MessageRow, url: string | null = null): ChatMessage {
  const path = row.attachment_path || null;
  const attachment: ChatAttachment | null =
    path && row.attachment_name && row.attachment_mime && row.attachment_size
      ? {
          path,
          name: row.attachment_name,
          mime: row.attachment_mime,
          size: row.attachment_size,
          url,
        }
      : null;

  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
    attachment,
  };
}

const MESSAGE_COLUMNS =
  "id, conversation_id, sender_id, body, created_at, attachment_path, attachment_name, attachment_mime, attachment_size";

export async function purgeExpiredChat() {
  try {
    const supabase = await createClient();
    await supabase.rpc("purge_old_chat");
  } catch {
    // Function is added in 0016_chat_retention.sql.
  }
}

export async function loadChatMessages(conversationId: string): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const since = chatRetentionSince();
  const { data, error } = await supabase
    .from("chat_messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(200);

  let rows = (data ?? []) as MessageRow[];
  if (error) {
    const fallback = await supabase
      .from("chat_messages")
      .select("id, conversation_id, sender_id, body, created_at")
      .eq("conversation_id", conversationId)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(200);
    rows = (fallback.data ?? []) as MessageRow[];
  }

  return signChatMessages(rows);
}

export async function signChatMessages(rows: MessageRow[]): Promise<ChatMessage[]> {
  const paths = rows
    .map((row) => row.attachment_path)
    .filter((path): path is string => Boolean(path));

  const urls = new Map<string, string>();
  if (paths.length > 0) {
    const service = createServiceClient();
    const { data } = await service.storage.from(CHAT_ATTACHMENT_BUCKET).createSignedUrls(paths, 60 * 60);
    (data ?? []).forEach((row, index) => {
      const url = row.signedUrl || (row as { signedURL?: string }).signedURL;
      const path = row.path || paths[index];
      if (path && url) urls.set(path, url);
    });
  }

  return rows.map((row) => mapChatMessage(row, row.attachment_path ? urls.get(row.attachment_path) ?? null : null));
}

export async function requireChatPeer(meId: string, peerId: string) {
  if (!peerId || peerId === meId) return { error: "Choose someone else to chat with" };

  const supabase = await createClient();
  const { data: peer } = await supabase
    .from("employees")
    .select("id, full_name, employment_status")
    .eq("id", peerId)
    .maybeSingle();

  if (!peer) return { error: "Employee not found" };
  if (peer.employment_status === "TERMINATED" || peer.employment_status === "SUSPENDED") {
    return { error: "This person is not available for chat" };
  }
  return { peerName: peer.full_name };
}

export async function getOrCreateConversation(meId: string, peerId: string) {
  const supabase = await createClient();
  const [a, b] = chatPair(meId, peerId);

  const { data: existing } = await supabase
    .from("chat_conversations")
    .select("id, participant_a, participant_b")
    .eq("participant_a", a)
    .eq("participant_b", b)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("chat_conversations")
    .insert({ participant_a: a, participant_b: b })
    .select("id, participant_a, participant_b")
    .single();

  if (error?.code === "23505" || /duplicate|unique/i.test(error?.message || "")) {
    const { data: raced } = await supabase
      .from("chat_conversations")
      .select("id, participant_a, participant_b")
      .eq("participant_a", a)
      .eq("participant_b", b)
      .single();
    if (raced) return raced;
  }

  if (error || !created) {
    throw new Error(chatDbError(error?.message));
  }
  return created;
}

export async function deliverChatMessage(input: {
  peerEmployeeId: string;
  body: string;
  file?: File | null;
}): Promise<ChatSendResult> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { error: "Sign in to chat" };

  const text = input.body.trim();
  if (text.length > CHAT_MESSAGE_MAX) {
    return { error: `Keep messages under ${CHAT_MESSAGE_MAX} characters` };
  }

  const file = input.file && input.file.size > 0 ? input.file : null;
  if (!text && !file) return { error: "Type a message or attach a file" };

  let mime = "";
  let displayName = "";
  if (file) {
    if (file.size > CHAT_ATTACHMENT_MAX_BYTES) return { error: "Attachments can be up to 5 MB" };
    mime = resolveChatMime(file);
    if (!mime) return { error: "That file type is not allowed" };
    displayName = safeAttachmentName(file.name);
  }

  const peer = await requireChatPeer(ctx.employeeId, input.peerEmployeeId);
  if (peer.error) return { error: peer.error };

  const service = createServiceClient();
  let uploadedPath: string | null = null;

  try {
    const convo = await getOrCreateConversation(ctx.employeeId, input.peerEmployeeId);
    const supabase = await createClient();

    if (file) {
      const ext = fileExtension(displayName);
      uploadedPath = `${convo.id}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
      const bytes = Buffer.from(await file.arrayBuffer());
      const { error: uploadError } = await service.storage.from(CHAT_ATTACHMENT_BUCKET).upload(uploadedPath, bytes, {
        contentType: mime,
        upsert: false,
      });
      if (uploadError) return { error: chatDbError(uploadError.message) };
    }

    const inserted = file
      ? await supabase
          .from("chat_messages")
          .insert({
            conversation_id: convo.id,
            sender_id: ctx.employeeId,
            body: text,
            attachment_path: uploadedPath,
            attachment_name: displayName,
            attachment_mime: mime,
            attachment_size: file.size,
          })
          .select("*")
          .single()
      : await supabase
          .from("chat_messages")
          .insert({
            conversation_id: convo.id,
            sender_id: ctx.employeeId,
            body: text,
          })
          .select("*")
          .single();

    const { data: row, error } = inserted;

    if (error || !row) {
      if (uploadedPath) {
        await service.storage.from(CHAT_ATTACHMENT_BUCKET).remove([uploadedPath]);
      }
      return { error: chatDbError(error?.message) || "Could not send" };
    }

    const signed =
      uploadedPath
        ? await service.storage.from(CHAT_ATTACHMENT_BUCKET).createSignedUrl(uploadedPath, 60 * 60)
        : null;
    const message = mapChatMessage(row as MessageRow, signed?.data?.signedUrl ?? null);

    await emitToEmployees([ctx.employeeId, input.peerEmployeeId], "chat:message", {
      ...message,
      senderName: ctx.fullName,
      participantA: convo.participant_a,
      participantB: convo.participant_b,
    });

    return { message, conversationId: convo.id };
  } catch (error) {
    if (uploadedPath) {
      await service.storage.from(CHAT_ATTACHMENT_BUCKET).remove([uploadedPath]);
    }
    return { error: chatDbError(error instanceof Error ? error.message : "Could not send") };
  }
}

export async function signedUrlForMessage(messageId: string) {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { error: "Sign in to chat", url: null as string | null };

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("chat_messages")
    .select("id, conversation_id, attachment_path")
    .eq("id", messageId)
    .maybeSingle();

  if (!row?.attachment_path) return { error: "File not found", url: null };

  const { data: convo } = await supabase
    .from("chat_conversations")
    .select("participant_a, participant_b")
    .eq("id", row.conversation_id)
    .maybeSingle();

  if (!convo || (convo.participant_a !== ctx.employeeId && convo.participant_b !== ctx.employeeId)) {
    return { error: "Not allowed", url: null };
  }

  const service = createServiceClient();
  const { data, error } = await service.storage
    .from(CHAT_ATTACHMENT_BUCKET)
    .createSignedUrl(row.attachment_path, 60 * 60);

  if (error || !data?.signedUrl) return { error: chatDbError(error?.message), url: null };
  return { url: data.signedUrl };
}
