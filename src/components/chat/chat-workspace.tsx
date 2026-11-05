"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, Check, CheckCheck, Clock3, Loader2, MessageCircle, Paperclip, Search, Send, Smile, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getChatThread, getChatUpdates, markChatRead, sendChatMessage } from "@/lib/actions/chat";
import {
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_MESSAGE_MAX,
  chatPreviewText,
  formatFileSize,
  isAllowedChatFile,
  type ChatBootstrap,
  type ChatMessage,
  type ChatPerson,
  type ChatPreview,
} from "@/lib/chat/types";
import { formatChatDayLabel, formatCompactTime, formatRelativeTime, formatTime, initials } from "@/lib/format";
import { useAppSocket } from "@/components/realtime/app-socket";
import { ChatEmojiPicker } from "@/components/chat/emoji-picker";
import { ChatMedia } from "@/components/chat/chat-media";
import { ChatText } from "@/components/chat/chat-text";
import type { ChatReadEvent, ChatRealtimeMessage } from "@/lib/realtime/types";
import { cn } from "@/lib/utils";

const AVATAR_TONES = [
  "bg-emerald-600 text-white",
  "bg-sky-600 text-white",
  "bg-violet-600 text-white",
  "bg-amber-600 text-white",
  "bg-rose-600 text-white",
  "bg-teal-600 text-white",
  "bg-indigo-600 text-white",
  "bg-orange-600 text-white",
];

function avatarTone(id: string) {
  let n = 0;
  for (let i = 0; i < id.length; i += 1) n += id.charCodeAt(i);
  return AVATAR_TONES[n % AVATAR_TONES.length];
}

function peerFromMessage(meId: string, payload: ChatRealtimeMessage) {
  if (payload.senderId !== meId) return payload.senderId;
  return payload.participantA === meId ? payload.participantB : payload.participantA;
}

function PersonAvatar({
  person,
  online,
  size = "default",
}: {
  person: Pick<ChatPerson, "id" | "fullName">;
  online?: boolean;
  size?: "default" | "lg";
}) {
  return (
    <span className="relative shrink-0">
      <Avatar size={size === "lg" ? "lg" : "default"} className="rounded-full">
        <AvatarFallback className={cn("rounded-full text-[11px] font-semibold", avatarTone(person.id))}>
          {initials(person.fullName)}
        </AvatarFallback>
      </Avatar>
      {online ? (
        <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-background bg-emerald-500" />
      ) : null}
    </span>
  );
}

/** How often an open chat looks for new messages when no socket server is reachable. */
const POLL_MS = 4000;
const POLL_WITH_SOCKET_MS = 15_000;

/** Server rows win over what is on screen, except rows already here, so their file links do not reload. */
function mergeThread(existing: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(incoming.map((row) => [row.id, row]));
  for (const row of existing) {
    if (!row.id.startsWith("temp-")) byId.set(row.id, row);
  }
  return Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function ChatWorkspace({ bootstrap }: { bootstrap: ChatBootstrap }) {
  const pathname = usePathname();
  const { socket, connected, onlineIds: socketOnlineIds } = useAppSocket();
  const [polledOnlineIds, setPolledOnlineIds] = useState<string[]>([]);
  const [peerSeenAt, setPeerSeenAt] = useState<Record<string, string>>({});
  const onlineIds = useMemo(
    () => new Set([...socketOnlineIds, ...polledOnlineIds]),
    [socketOnlineIds, polledOnlineIds]
  );
  const [query, setQuery] = useState("");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [typingPeerId, setTypingPeerId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(bootstrap.initialPeerId);
  const [previews, setPreviews] = useState<ChatPreview[]>(bootstrap.previews);
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>(() =>
    bootstrap.initialPeerId ? { [bootstrap.initialPeerId]: bootstrap.initialMessages } : {}
  );
  const [conversationByPeer, setConversationByPeer] = useState<Record<string, string>>(() =>
    bootstrap.initialPeerId && bootstrap.initialConversationId
      ? { [bootstrap.initialPeerId]: bootstrap.initialConversationId }
      : {}
  );
  const [peerReadAt, setPeerReadAt] = useState<Record<string, string>>(() =>
    bootstrap.initialPeerId && bootstrap.peerLastReadAt
      ? { [bootstrap.initialPeerId]: bootstrap.peerLastReadAt }
      : {}
  );

  const peopleById = useMemo(
    () => new Map(bootstrap.people.map((person) => [person.id, person])),
    [bootstrap.people]
  );
  const previewByPeer = useMemo(
    () => new Map(previews.map((row) => [row.peerId, row])),
    [previews]
  );
  const selected = selectedId ? peopleById.get(selectedId) ?? null : null;
  const messages = selectedId ? (threads[selectedId] ?? []) : [];
  const scrollerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<number>(0);
  const lastTypingSent = useRef(0);

  const listedPeople = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = bootstrap.people.filter((person) => {
      if (onlyUnread && !previewByPeer.get(person.id)?.unread) return false;
      if (!needle) return true;
      return (
        person.fullName.toLowerCase().includes(needle) ||
        person.employeeCode.toLowerCase().includes(needle) ||
        person.roleLabel.toLowerCase().includes(needle)
      );
    });
    return filtered.sort((a, b) => {
      const pa = previewByPeer.get(a.id);
      const pb = previewByPeer.get(b.id);
      if (pa?.lastMessageAt && pb?.lastMessageAt) {
        return pb.lastMessageAt.localeCompare(pa.lastMessageAt);
      }
      if (pa?.lastMessageAt) return -1;
      if (pb?.lastMessageAt) return 1;
      if (onlineIds.has(a.id) !== onlineIds.has(b.id)) return onlineIds.has(a.id) ? -1 : 1;
      return a.fullName.localeCompare(b.fullName);
    });
  }, [bootstrap.people, previewByPeer, query, onlineIds, onlyUnread]);

  const unreadPeople = useMemo(
    () => bootstrap.people.filter((person) => previewByPeer.get(person.id)?.unread).length,
    [bootstrap.people, previewByPeer]
  );

  const rememberUrl = useCallback(
    (peerId: string | null) => {
      const url = peerId ? `${pathname}?with=${peerId}` : pathname;
      window.history.replaceState(null, "", url);
    },
    [pathname]
  );

  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  const upsertMessage = useCallback((peerId: string, message: ChatMessage, fromMe: boolean) => {
    setThreads((current) => {
      const existing = current[peerId] ?? [];
      if (existing.some((row) => row.id === message.id)) return current;
      const withoutTemp = existing.filter((row) => {
        if (!row.id.startsWith("temp-")) return true;
        return !(
          row.senderId === message.senderId &&
          row.body === message.body &&
          (row.attachment?.name ?? "") === (message.attachment?.name ?? "")
        );
      });
      return { ...current, [peerId]: [...withoutTemp, { ...message, attachment: message.attachment ?? null }] };
    });
    setConversationByPeer((current) => ({ ...current, [peerId]: message.conversationId }));
    setPreviews((current) => {
      const rest = current.filter((row) => row.peerId !== peerId);
      const previous = current.find((row) => row.peerId === peerId);
      const viewing = selectedRef.current === peerId;
      const unread = fromMe || viewing ? 0 : (previous?.unread ?? 0) + 1;
      return [
        {
          conversationId: message.conversationId,
          peerId,
          lastMessageAt: message.createdAt,
          lastPreview: chatPreviewText(message),
          unread,
        },
        ...rest,
      ];
    });
  }, []);

  const openPeer = useCallback(
    async (peerId: string) => {
      setSelectedId(peerId);
      rememberUrl(peerId);
      if (threads[peerId] === undefined) {
        setLoadingThread(true);
        const result = await getChatThread(peerId);
        setLoadingThread(false);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        setThreads((current) => ({ ...current, [peerId]: mergeThread(current[peerId] ?? [], result.messages) }));
        if (result.conversationId) {
          setConversationByPeer((current) => ({ ...current, [peerId]: result.conversationId! }));
        }
        if (result.peerLastReadAt) {
          setPeerReadAt((current) => ({ ...current, [peerId]: result.peerLastReadAt! }));
        }
      }
      const marked = await markChatRead(peerId);
      if (marked.conversationId) {
        setPreviews((current) =>
          current.map((row) => (row.peerId === peerId ? { ...row, unread: 0 } : row))
        );
        window.dispatchEvent(new Event("worktrack:chat-read-self"));
      }
    },
    [rememberUrl, threads]
  );

  useEffect(() => {
    if (!bootstrap.initialPeerId) return;
    void markChatRead(bootstrap.initialPeerId).then((marked) => {
      if (!marked.conversationId) return;
      setPreviews((current) =>
        current.map((row) => (row.peerId === bootstrap.initialPeerId ? { ...row, unread: 0 } : row))
      );
      window.dispatchEvent(new Event("worktrack:chat-read-self"));
    });
  }, [bootstrap.initialPeerId]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, selectedId, typingPeerId, loadingThread]);

  useEffect(() => {
    if (!socket) return;

    function onMessage(payload: ChatRealtimeMessage) {
      if (!payload?.id) return;
      const peerId = peerFromMessage(bootstrap.meId, payload);
      if (!peopleById.has(peerId)) return;
      upsertMessage(peerId, payload, payload.senderId === bootstrap.meId);
      // Blue ticks mean it was seen, so a chat open in a background tab does not count yet.
      if (
        selectedRef.current === peerId &&
        payload.senderId !== bootstrap.meId &&
        document.visibilityState === "visible"
      ) {
        void markChatRead(peerId).then((marked) => {
          if (!marked.conversationId) return;
          setPreviews((current) =>
            current.map((row) => (row.peerId === peerId ? { ...row, unread: 0 } : row))
          );
          window.dispatchEvent(new Event("worktrack:chat-read-self"));
        });
      }
    }

    function onRead(payload: ChatReadEvent) {
      if (!payload?.readerId || payload.readerId === bootstrap.meId) return;
      setPeerReadAt((current) => ({ ...current, [payload.readerId]: payload.readAt }));
    }

    function onTyping(payload: { fromEmployeeId?: string }) {
      if (!payload?.fromEmployeeId || payload.fromEmployeeId === bootstrap.meId) return;
      setTypingPeerId(payload.fromEmployeeId);
      window.clearTimeout(typingTimer.current);
      typingTimer.current = window.setTimeout(() => setTypingPeerId(null), 1800);
    }

    socket.on("chat:message", onMessage);
    socket.on("chat:read", onRead);
    socket.on("chat:typing", onTyping);
    return () => {
      socket.off("chat:message", onMessage);
      socket.off("chat:read", onRead);
      socket.off("chat:typing", onTyping);
      window.clearTimeout(typingTimer.current);
    };
  }, [socket, bootstrap.meId, peopleById, upsertMessage]);

  const threadsRef = useRef(threads);
  threadsRef.current = threads;

  // Coming back to a chat left open in the background is the moment its messages are seen.
  useEffect(() => {
    function onVisible() {
      const peerId = selectedRef.current;
      if (document.visibilityState !== "visible" || !peerId) return;
      void markChatRead(peerId).then(() => window.dispatchEvent(new Event("worktrack:chat-read-self")));
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // The hosted site has no socket server, so without this new messages would need a page refresh.
  // Online and delivered come from here either way, so it keeps running, slower, with a socket.
  useEffect(() => {
    let busy = false;

    async function tick() {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const peerId = selectedRef.current;
        const updates = await getChatUpdates(peerId);
        setPreviews(
          updates.previews.map((row) => (row.peerId === selectedRef.current ? { ...row, unread: 0 } : row))
        );
        setPolledOnlineIds(updates.onlineIds);
        if (!peerId) return;
        const { peerLastReadAt, peerLastSeenAt } = updates;
        if (peerLastReadAt) setPeerReadAt((current) => ({ ...current, [peerId]: peerLastReadAt }));
        if (peerLastSeenAt) setPeerSeenAt((current) => ({ ...current, [peerId]: peerLastSeenAt }));

        const latest = updates.previews.find((row) => row.peerId === peerId)?.lastMessageAt;
        const thread = threadsRef.current[peerId];
        // No thread yet means opening the chat is already loading it.
        if (!latest || !thread || thread.some((row) => row.createdAt >= latest)) return;
        const result = await getChatThread(peerId);
        if (result.error) return;
        setThreads((current) => ({ ...current, [peerId]: mergeThread(current[peerId] ?? [], result.messages) }));
        if (selectedRef.current === peerId) {
          void markChatRead(peerId).then(() => window.dispatchEvent(new Event("worktrack:chat-read-self")));
        }
      } catch {
        /* the next tick tries again */
      } finally {
        busy = false;
      }
    }

    void tick();
    const timer = window.setInterval(() => void tick(), connected ? POLL_WITH_SOCKET_MS : POLL_MS);
    return () => window.clearInterval(timer);
  }, [connected, selectedId]);

  async function handleSend() {
    if (!selectedId || sending) return;
    const text = draft.trim();
    if (!text && !file) return;
    const pendingFile = file;
    const pendingPreview = filePreview;
    setDraft("");
    clearFile(false);
    setSending(true);
    const temp: ChatMessage = {
      id: `temp-${Date.now()}`,
      conversationId: conversationByPeer[selectedId] || "pending",
      senderId: bootstrap.meId,
      body: text,
      createdAt: new Date().toISOString(),
      attachment: pendingFile
        ? {
            path: "pending",
            name: pendingFile.name,
            mime: pendingFile.type || "application/octet-stream",
            size: pendingFile.size,
            url: pendingPreview,
          }
        : null,
    };
    setThreads((current) => ({
      ...current,
      [selectedId]: [...(current[selectedId] ?? []), temp],
    }));

    let result: { error?: string; message?: ChatMessage };
    if (pendingFile) {
      const form = new FormData();
      form.set("peerId", selectedId);
      form.set("body", text);
      form.set("file", pendingFile);
      const response = await fetch("/api/chat/messages", { method: "POST", body: form });
      result = (await response.json()) as { error?: string; message?: ChatMessage };
    } else {
      result = await sendChatMessage(selectedId, text);
    }

    setSending(false);
    if (pendingPreview?.startsWith("blob:")) URL.revokeObjectURL(pendingPreview);
    if (result.error || !result.message) {
      setThreads((current) => ({
        ...current,
        [selectedId]: (current[selectedId] ?? []).filter((row) => row.id !== temp.id),
      }));
      setDraft(text);
      if (pendingFile) applyFile(pendingFile);
      toast.error(result.error || "Could not send");
      return;
    }
    upsertMessage(selectedId, result.message, true);
  }

  function applyFile(next: File) {
    if (next.size > CHAT_ATTACHMENT_MAX_BYTES) {
      toast.error("Attachments can be up to 5 MB");
      return;
    }
    if (!isAllowedChatFile(next)) {
      toast.error("That file type is not allowed");
      return;
    }
    setFilePreview((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return next.type.startsWith("image/") ? URL.createObjectURL(next) : null;
    });
    setFile(next);
  }

  function clearFile(revoke = true) {
    if (revoke && filePreview?.startsWith("blob:")) URL.revokeObjectURL(filePreview);
    setFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function insertEmoji(emoji: string) {
    const el = composerRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const next = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`.slice(0, CHAT_MESSAGE_MAX);
    setDraft(next);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = Math.min(start + emoji.length, next.length);
      el?.setSelectionRange(pos, pos);
    });
  }

  function onDraftChange(value: string) {
    setDraft(value.slice(0, CHAT_MESSAGE_MAX));
    if (!selectedId || !socket) return;
    const now = Date.now();
    if (now - lastTypingSent.current < 900) return;
    lastTypingSent.current = now;
    socket.emit("chat:typing", { toEmployeeId: selectedId });
  }

  const selectedOnline = selectedId ? onlineIds.has(selectedId) : false;
  const selectedTyping = Boolean(selectedId && typingPeerId === selectedId);
  const readAt = selectedId ? peerReadAt[selectedId] : null;
  const seenAt = selectedId ? peerSeenAt[selectedId] : null;

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-muted">
      {/* One pane until there is room for both next to the app sidebar. */}
      <aside
        className={cn(
          "w-full min-h-0 flex-col border-r bg-card lg:w-80 lg:shrink-0 xl:w-96",
          selectedId ? "hidden lg:flex" : "flex"
        )}
      >
        <div className="shrink-0 border-b bg-muted px-3 py-2.5">
          <p className="text-[15px] font-semibold tracking-tight">Chats</p>
          <p className="text-[11px] text-muted-foreground">Messages and files delete after 7 days.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
          <label className="relative block min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name or ID"
              aria-label="Search employees"
              className="h-8 rounded-sm pl-8"
            />
          </label>
          <button
            type="button"
            aria-pressed={onlyUnread}
            onClick={() => setOnlyUnread((value) => !value)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border px-2.5 text-xs font-semibold transition-colors",
              onlyUnread
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            Unread
            <span className="tabular-nums">{unreadPeople}</span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {bootstrap.people.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No other employees to chat with yet
            </p>
          ) : listedPeople.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {onlyUnread && !query.trim() ? "No unread messages" : "No employees match that search"}
            </p>
          ) : (
            listedPeople.map((person) => {
              const preview = previewByPeer.get(person.id);
              const active = selectedId === person.id;
              const typing = typingPeerId === person.id;
              return (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => void openPeer(person.id)}
                  className={cn(
                    "flex w-full items-center gap-3 border-b px-3 py-2.5 text-left transition-colors hover:bg-accent",
                    active && "bg-accent shadow-[inset_3px_0_0_0_var(--primary)]"
                  )}
                >
                  <PersonAvatar person={person} online={onlineIds.has(person.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn("truncate text-[13.5px]", preview?.unread ? "font-bold" : "font-medium")}>
                        {person.fullName}
                      </span>
                      {preview?.lastMessageAt ? (
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {formatRelativeTime(preview.lastMessageAt)}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-[12.5px]",
                          preview?.unread ? "font-medium text-foreground" : "text-muted-foreground",
                          typing && "font-medium text-primary"
                        )}
                      >
                        {typing ? "typing…" : preview?.lastPreview || person.roleLabel || person.employeeCode}
                      </span>
                      {preview && preview.unread > 0 ? (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                          {preview.unread > 99 ? "99+" : preview.unread}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col",
          selectedId ? "flex" : "hidden lg:flex"
        )}
      >
        {!selected ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-md border bg-card text-primary">
              <MessageCircle className="size-6" />
            </span>
            <div>
              <p className="text-base font-semibold tracking-tight">Pick someone to chat with</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Choose a name on the left to start or continue a private conversation.
              </p>
            </div>
          </div>
        ) : (
          <>
            <header className="flex shrink-0 items-center gap-3 border-b bg-card px-3 py-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 lg:hidden"
                onClick={() => {
                  setSelectedId(null);
                  rememberUrl(null);
                }}
                aria-label="Back to chats"
              >
                <ArrowLeft className="size-4" />
              </Button>
              <PersonAvatar person={selected} online={selectedOnline} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{selected.fullName}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {selectedTyping
                    ? "typing…"
                    : selectedOnline
                      ? "online"
                      : [selected.roleLabel, selected.employeeCode].filter(Boolean).join(" · ")}
                </p>
              </div>
            </header>

            <div
              ref={scrollerRef}
              className="relative min-h-0 flex-1 overflow-y-auto px-3 py-3 lg:px-6"
              onDragEnter={(event) => {
                event.preventDefault();
                if (event.dataTransfer.types.includes("Files")) setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node)) return;
                setDragging(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const dropped = event.dataTransfer.files[0];
                if (dropped) applyFile(dropped);
              }}
            >
              {dragging ? (
                <div className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-mint-soft text-sm font-medium text-primary">
                  Drop a file up to 5 MB
                </div>
              ) : null}
              {loadingThread && messages.length === 0 ? (
                <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
                  Loading messages
                </p>
              ) : messages.length === 0 ? (
                <div className="flex h-full min-h-[16rem] flex-col items-center justify-center text-center">
                  <p className="rounded-sm border bg-card px-4 py-2 text-sm text-muted-foreground">
                    Say hello to {selected.fullName.split(" ")[0]}
                  </p>
                </div>
              ) : (
                <ol className="mx-auto flex w-full max-w-4xl flex-col">
                  {messages.map((message, index) => {
                    const mine = message.senderId === bootstrap.meId;
                    const day = formatChatDayLabel(message.createdAt);
                    const previous = messages[index - 1];
                    const showDay = !previous || formatChatDayLabel(previous.createdAt) !== day;
                    const sameSender = !showDay && previous?.senderId === message.senderId;
                    const pending = message.id.startsWith("temp-");
                    const seen = Boolean(readAt && message.createdAt <= readAt);
                    // Delivered: they are online now, or their app has been open since it was sent.
                    const delivered = seen || selectedOnline || Boolean(seenAt && message.createdAt <= seenAt);
                    return (
                      <li key={message.id} className={sameSender ? "mt-0.5" : "mt-2.5"}>
                        {showDay ? (
                          <div className="my-3 flex justify-center">
                            <span className="rounded-sm border bg-card px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                              {day}
                            </span>
                          </div>
                        ) : null}
                        <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                          <div
                            title={formatTime(message.createdAt)}
                            className={cn(
                              "max-w-[85%] overflow-hidden rounded-md border px-2.5 py-1.5 text-[13.5px] leading-5 text-foreground sm:max-w-[70%] xl:max-w-xl",
                              mine ? "border-primary/25 bg-mint-soft" : "bg-card"
                            )}
                          >
                            {message.attachment ? (
                              <ChatMedia attachment={message.attachment} messageId={message.id} />
                            ) : null}
                            {message.body ? <ChatText text={message.body} /> : null}
                            <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-muted-foreground tabular-nums">
                              {formatCompactTime(message.createdAt)}
                              {!mine ? null : pending ? (
                                <Clock3 className="size-3" aria-label="Sending" />
                              ) : seen ? (
                                <CheckCheck className="size-3.5 text-sky-600 dark:text-sky-300" aria-label="Seen" />
                              ) : delivered ? (
                                <CheckCheck className="size-3.5" aria-label="Delivered" />
                              ) : (
                                <Check className="size-3.5" aria-label="Sent" />
                              )}
                            </span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            <form
              className="flex shrink-0 flex-col gap-2 border-t bg-card px-2 py-2 sm:px-3"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSend();
              }}
            >
              {file ? (
                <div className="flex items-center gap-2 rounded-sm border bg-muted px-2 py-1.5">
                  {filePreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={filePreview} alt="" className="size-10 rounded object-cover" />
                  ) : (
                    <span className="flex size-10 items-center justify-center rounded bg-primary text-primary-foreground">
                      <Paperclip className="size-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{file.name}</span>
                    <span className="text-[11px] text-muted-foreground">{formatFileSize(file.size)} · max 5 MB</span>
                  </span>
                  <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => clearFile()} aria-label="Remove file">
                    <X className="size-4" />
                  </Button>
                </div>
              ) : null}
              <div className="flex items-end gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                  className="sr-only"
                  onChange={(event) => {
                    const next = event.target.files?.[0];
                    if (next) applyFile(next);
                  }}
                />
                <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="size-10 shrink-0 rounded-sm text-muted-foreground" aria-label="Emoji">
                      <Smile className="size-5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" side="top" className="w-auto p-2.5">
                    <ChatEmojiPicker onPick={insertEmoji} />
                  </PopoverContent>
                </Popover>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-10 shrink-0 rounded-sm text-muted-foreground"
                  aria-label="Attach file"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="size-5" />
                </Button>
                <textarea
                  ref={composerRef}
                  value={draft}
                  onChange={(event) => onDraftChange(event.target.value)}
                  onPaste={(event) => {
                    const pasted = event.clipboardData.files[0];
                    if (!pasted) return;
                    event.preventDefault();
                    applyFile(pasted);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                  rows={1}
                  placeholder="Type a message"
                  aria-label="Message"
                  className="field-sizing-content max-h-32 min-h-10 min-w-0 flex-1 resize-none rounded-sm border bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={sending || (!draft.trim() && !file)}
                  className="size-10 shrink-0 rounded-sm"
                  aria-label="Send"
                >
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </Button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
