import { createDataClient as createClient } from "@/lib/supabase/data";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import {
  chatPair,
  chatRetentionSince,
  type ChatBootstrap,
  type ChatMessage,
  type ChatPerson,
  type ChatPreview,
} from "@/lib/chat/types";
import { loadChatMessages, purgeExpiredChat } from "@/lib/chat/send";

export type { ChatBootstrap, ChatMessage, ChatPerson, ChatPreview } from "@/lib/chat/types";
export { CHAT_MESSAGE_MAX, chatPair } from "@/lib/chat/types";

export async function getChatBootstrap(peerId?: string | null): Promise<ChatBootstrap | null> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return null;

  const supabase = await createClient();
  const meId = ctx.employeeId;
  await purgeExpiredChat();

  const { data: employees } = await supabase
    .from("employees")
    .select("id, full_name, employee_code, employment_status")
    .neq("id", meId)
    .in("employment_status", ["ACTIVE", "ON_LEAVE"])
    .order("full_name");

  const peopleRows = employees ?? [];
  const ids = peopleRows.map((row) => row.id);
  const roleByEmployee = new Map<string, string>();

  if (ids.length > 0) {
    const { data: assignments } = await supabase
      .from("employee_roles")
      .select("employee_id, role_id")
      .eq("is_primary", true)
      .in("employee_id", ids);
    const roleIds = Array.from(new Set((assignments ?? []).map((row) => row.role_id)));
    const { data: roles } =
      roleIds.length > 0
        ? await supabase.from("roles").select("id, display_name").in("id", roleIds)
        : { data: [] as { id: string; display_name: string }[] };
    const roleName = new Map((roles ?? []).map((row) => [row.id, row.display_name]));
    for (const row of assignments ?? []) {
      roleByEmployee.set(row.employee_id, roleName.get(row.role_id) ?? "");
    }
  }

  const people: ChatPerson[] = peopleRows.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    employeeCode: row.employee_code,
    roleLabel: roleByEmployee.get(row.id) || "",
    employmentStatus: row.employment_status,
  }));

  const { data: convos } = await supabase
    .from("chat_conversations")
    .select("id, participant_a, participant_b, last_message_at, last_message_preview, unread_a, unread_b")
    .or(`participant_a.eq.${meId},participant_b.eq.${meId}`)
    .order("last_message_at", { ascending: false });

  const known = new Set(ids);
  const since = chatRetentionSince();
  const previews: ChatPreview[] = (convos ?? [])
    .map((row) => {
      const peer = row.participant_a === meId ? row.participant_b : row.participant_a;
      const fresh = row.last_message_at >= since;
      return {
        conversationId: row.id,
        peerId: peer,
        lastMessageAt: fresh ? row.last_message_at : null,
        lastPreview: fresh ? row.last_message_preview : null,
        unread: fresh ? (row.participant_a === meId ? row.unread_a : row.unread_b) : 0,
      };
    })
    .filter((row) => known.has(row.peerId));

  const requested =
    peerId && peerId !== meId && known.has(peerId) ? peerId : null;

  let initialConversationId: string | null = null;
  let initialMessages: ChatMessage[] = [];
  let peerLastReadAt: string | null = null;

  if (requested) {
    const [a, b] = chatPair(meId, requested);
    const existing =
      (convos ?? []).find(
        (row) => row.participant_a === a && row.participant_b === b
      ) ?? null;
    if (existing) {
      initialConversationId = existing.id;
      const [{ data: readRow }, messages] = await Promise.all([
        supabase
          .from("chat_reads")
          .select("last_read_at")
          .eq("conversation_id", existing.id)
          .eq("employee_id", requested)
          .maybeSingle(),
        loadChatMessages(existing.id),
      ]);
      initialMessages = messages;
      peerLastReadAt = readRow?.last_read_at ?? null;
    }
  }

  return {
    meId,
    meName: ctx.fullName,
    people,
    previews,
    initialPeerId: requested,
    initialConversationId,
    initialMessages,
    peerLastReadAt,
  };
}

export async function getChatUnreadTotal(employeeId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_conversations")
    .select("participant_a, unread_a, unread_b")
    .or(`participant_a.eq.${employeeId},participant_b.eq.${employeeId}`);

  if (error) return 0;

  return (data ?? []).reduce((sum, row) => {
    return sum + (row.participant_a === employeeId ? row.unread_a : row.unread_b);
  }, 0);
}
