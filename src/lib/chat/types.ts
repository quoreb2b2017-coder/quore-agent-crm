export const CHAT_MESSAGE_MAX = 4000;
export const CHAT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_ATTACHMENT_BUCKET = "chat-attachments";
export const CHAT_RETENTION_DAYS = 7;

export function chatRetentionSince(now = new Date()) {
  return new Date(now.getTime() - CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export const CHAT_ATTACHMENT_MIME = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/bmp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  bmp: "image/bmp",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  zip: "application/zip",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

export type ChatAttachment = {
  path: string;
  name: string;
  mime: string;
  size: number;
  url: string | null;
};

export type ChatPerson = {
  id: string;
  fullName: string;
  employeeCode: string;
  roleLabel: string;
  employmentStatus: string;
};

export type ChatPreview = {
  conversationId: string;
  peerId: string;
  lastMessageAt: string | null;
  lastPreview: string | null;
  unread: number;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  attachment: ChatAttachment | null;
};

export type ChatBootstrap = {
  meId: string;
  meName: string;
  people: ChatPerson[];
  previews: ChatPreview[];
  initialPeerId: string | null;
  initialConversationId: string | null;
  initialMessages: ChatMessage[];
  peerLastReadAt: string | null;
};

export function chatPair(a: string, b: string): [string, string] {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? [x, y] : [y, x];
}

export function fileExtension(name: string) {
  const trimmed = name.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot <= 0 || dot === trimmed.length - 1) return "";
  return trimmed.slice(dot + 1).toLowerCase();
}

export function resolveChatMime(file: { name: string; type?: string | null }) {
  const fromType = (file.type || "").toLowerCase().split(";")[0].trim();
  if (fromType && CHAT_ATTACHMENT_MIME.includes(fromType as (typeof CHAT_ATTACHMENT_MIME)[number])) {
    return fromType;
  }
  return MIME_BY_EXT[fileExtension(file.name)] || "";
}

export function isAllowedChatFile(file: { name: string; type?: string | null; size: number }) {
  if (!file.size || file.size > CHAT_ATTACHMENT_MAX_BYTES) return false;
  return Boolean(resolveChatMime(file));
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function chatPreviewText(message: {
  body?: string | null;
  attachment?: Pick<ChatAttachment, "name" | "mime"> | null;
}) {
  const body = (message.body || "").trim();
  if (body) return body;
  const mime = message.attachment?.mime || "";
  if (mime.startsWith("image/")) return "Photo";
  if (mime.startsWith("video/")) return "Video";
  if (mime.startsWith("audio/")) return "Audio";
  return message.attachment?.name || "Attachment";
}

export function safeAttachmentName(name: string) {
  const cleaned = name.replace(/[/\\]/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || "file").slice(0, 120);
}
