"use client";

import type { ReactNode } from "react";

const URL_RE = /((?:https?:\/\/|www\.)[^\s]+)/gi;
const TRAILING_PUNCT = /[.,;:!?]+$/;

function toHref(raw: string) {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function isSafeHttpUrl(href: string) {
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function ChatText({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  const re = new RegExp(URL_RE.source, URL_RE.flags);
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }

    let raw = match[1];
    const punct = raw.match(TRAILING_PUNCT)?.[0] ?? "";
    if (punct) raw = raw.slice(0, -punct.length);

    const href = toHref(raw);
    if (raw && isSafeHttpUrl(href)) {
      nodes.push(
        <a
          key={`u-${key}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-[#027eb5] underline underline-offset-2 hover:opacity-80 dark:text-sky-300"
        >
          {raw}
        </a>
      );
      key += 1;
    } else {
      nodes.push(match[1]);
    }

    if (punct) nodes.push(punct);
    last = match.index + match[0].length;
  }

  if (last < text.length) nodes.push(text.slice(last));

  return <p className="whitespace-pre-wrap break-words">{nodes}</p>;
}
