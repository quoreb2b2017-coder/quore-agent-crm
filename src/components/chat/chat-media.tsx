"use client";

import { Download, FileText } from "lucide-react";
import type { ChatAttachment } from "@/lib/chat/types";
import { formatFileSize } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

function fileHref(attachment: ChatAttachment, messageId: string) {
  return attachment.url || `/api/chat/attachments/${messageId}`;
}

export function ChatMedia({
  attachment,
  messageId,
}: {
  attachment: ChatAttachment;
  messageId: string;
}) {
  const href = fileHref(attachment, messageId);

  if (attachment.mime.startsWith("image/")) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={href}
          alt={attachment.name}
          className="mb-1 max-h-64 max-w-full rounded-md object-cover"
        />
      </a>
    );
  }

  if (attachment.mime.startsWith("video/")) {
    return (
      <video src={href} controls className="mb-1 max-h-64 w-full rounded-md bg-black" preload="metadata" />
    );
  }

  if (attachment.mime.startsWith("audio/")) {
    return <audio src={href} controls className="mb-1 w-full max-w-[16rem]" />;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "mb-1 flex items-center gap-2.5 rounded-md bg-black/5 px-2.5 py-2 text-left dark:bg-white/10"
      )}
    >
      <span className="flex size-9 items-center justify-center rounded-md bg-emerald-600 text-white">
        <FileText className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{attachment.name}</span>
        <span className="text-[11px] opacity-70">{formatFileSize(attachment.size)}</span>
      </span>
      <Download className="size-4 shrink-0 opacity-70" />
    </a>
  );
}
