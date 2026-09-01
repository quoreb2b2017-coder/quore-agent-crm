"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, Check, CheckCheck, MessageCircle, Paperclip, Search, Send, Smile, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getChatThread, markChatRead, sendChatMessage } from "@/lib/actions/chat";
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

export function ChatWorkspace({ bootstrap }: { bootstrap: ChatBootstrap }) {
  const pathname = usePathname();
  const { socket, onlineIds } = useAppSocket();
  const [query, setQuery] = useState("");
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
  }, [bootstrap.people, previewByPeer, query, onlineIds]);

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
        setThreads((current) => {
          const incoming = result.messages;
          const existing = current[peerId] ?? [];
          const byId = new Map(incoming.map((row) => [row.id, row]));
          for (const row of existing) {
            if (!row.id.startsWith("temp-")) byId.set(row.id, row);
          }
          return {
            ...current,
            [peerId]: Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
          };
        });
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
      if (selectedRef.current === peerId && payload.senderId !== bootstrap.meId) {
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

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-[#efeae2] dark:bg-[#0b141a]">
      <aside
        className={cn(
          "flex w-full min-h-0 flex-col border-r border-black/5 bg-[#fff] dark:border-white/10 dark:bg-[#111b21] md:w-[22.5rem] md:max-w-[22.5rem]",
          selectedId ? "hidden md:flex" : "flex"
        )}
      >
        <div className="shrink-0 border-b border-black/5 bg-[#f0f2f5] px-4 py-3 dark:border-white/10 dark:bg-[#202c33]">
          <p className="text-[17px] font-semibold tracking-tight">Chats</p>
          <p className="text-[11px] text-muted-foreground">
            Select an employee to chat. Messages and files auto-delete after 7 days.
          </p>
        </div>
        <div className="shrink-0 px-3 py-2">
          <label className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search employees"
              className="h-9 rounded-lg bg-[#f0f2f5] pl-8 dark:bg-[#202c33]"
            />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {bootstrap.people.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No other employees to chat with yet
            </p>
          ) : listedPeople.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No employees match that search</p>
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
                    "flex w-full items-center gap-3 border-b border-black/5 px-3 py-2.5 text-left transition hover:bg-[#f5f6f6] dark:border-white/5 dark:hover:bg-white/5",
                    active && "bg-[#f0f2f5] dark:bg-white/8"
                  )}
                >
                  <PersonAvatar person={person} online={onlineIds.has(person.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[14px] font-medium">{person.fullName}</span>
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
                          typing && "font-medium text-emerald-600"
                        )}
                      >
                        {typing ? "typing…" : preview?.lastPreview || person.roleLabel || person.employeeCode}
                      </span>
                      {preview && preview.unread > 0 ? (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[10px] font-semibold text-white">
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
          selectedId ? "flex" : "hidden md:flex"
        )}
      >
        {!selected ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-white/80 text-emerald-700 shadow-sm dark:bg-white/10">
              <MessageCircle className="size-8" />
            </span>
            <div>
              <p className="text-lg font-semibold tracking-tight">WorkTrack Chat</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Pick a teammate on the left to start or continue a private conversation.
              </p>
            </div>
          </div>
        ) : (
          <>
            <header className="flex shrink-0 items-center gap-3 border-b border-black/5 bg-[#f0f2f5] px-3 py-2.5 dark:border-white/10 dark:bg-[#202c33]">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="md:hidden"
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
              className="relative min-h-0 flex-1 overflow-y-auto px-3 py-3 md:px-8"
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
              style={{
                backgroundImage:
                  "radial-gradient(rgba(0,0,0,0.045) 0.8px, transparent 0.8px)",
                backgroundSize: "18px 18px",
              }}
            >
              {dragging ? (
                <div className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-emerald-600 bg-emerald-600/10 text-sm font-medium text-emerald-800 dark:text-emerald-200">
                  Drop a file up to 5 MB
                </div>
              ) : null}
              {loadingThread && messages.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">Loading messages…</p>
              ) : messages.length === 0 ? (
                <div className="flex h-full min-h-[16rem] flex-col items-center justify-center text-center">
                  <p className="rounded-full bg-white/80 px-4 py-2 text-sm text-muted-foreground shadow-sm dark:bg-black/30">
                    Say hello to {selected.fullName.split(" ")[0]}
                  </p>
                </div>
              ) : (
                <ol className="mx-auto flex max-w-3xl flex-col gap-1.5">
                  {messages.map((message, index) => {
                    const mine = message.senderId === bootstrap.meId;
                    const day = formatChatDayLabel(message.createdAt);
                    const previous = messages[index - 1];
                    const showDay = !previous || formatChatDayLabel(previous.createdAt) !== day;
                    const seen = Boolean(readAt && message.createdAt <= readAt);
                    return (
                      <li key={message.id}>
                        {showDay ? (
                          <div className="my-3 flex justify-center">
                            <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm dark:bg-black/40">
                              {day}
                            </span>
                          </div>
                        ) : null}
                        <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                          <div
                            title={formatTime(message.createdAt)}
                            className={cn(
                              "max-w-[min(100%,28rem)] overflow-hidden rounded-lg px-2.5 py-1.5 text-[13.5px] leading-5 shadow-sm",
                              mine
                                ? "rounded-br-sm bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]"
                                : "rounded-bl-sm bg-white text-[#111b21] dark:bg-[#202c33] dark:text-[#e9edef]"
                            )}
                          >
                            {message.attachment ? (
                              <ChatMedia attachment={message.attachment} messageId={message.id} />
                            ) : null}
                            {message.body ? <ChatText text={message.body} /> : null}
                            <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-black/45 dark:text-white/50">
                              {formatCompactTime(message.createdAt)}
                              {mine ? (
                                seen ? (
                                  <CheckCheck className="size-3.5 text-sky-600 dark:text-sky-300" />
                                ) : (
                                  <Check className="size-3.5" />
                                )
                              ) : null}
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
              className="flex shrink-0 flex-col gap-2 border-t border-black/5 bg-[#f0f2f5] px-3 py-2.5 dark:border-white/10 dark:bg-[#202c33]"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSend();
              }}
            >
              {file ? (
                <div className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 ring-1 ring-black/5 dark:bg-[#2a3942] dark:ring-white/10">
                  {filePreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={filePreview} alt="" className="size-10 rounded object-cover" />
                  ) : (
                    <span className="flex size-10 items-center justify-center rounded bg-emerald-600 text-white">
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
              <div className="flex items-end gap-1.5">
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
                    <Button type="button" variant="ghost" size="icon" className="size-10 rounded-full text-muted-foreground" aria-label="Emoji">
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
                  className="size-10 rounded-full text-muted-foreground"
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
                  className="field-sizing-content max-h-32 min-h-10 flex-1 resize-none rounded-[1.5rem] border-0 bg-white px-4 py-2.5 text-sm outline-none ring-1 ring-black/5 placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-emerald-600/40 dark:bg-[#2a3942] dark:ring-white/10"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={sending || (!draft.trim() && !file)}
                  className="size-10 rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
                  aria-label="Send"
                >
                  <Send className="size-4" />
                </Button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
