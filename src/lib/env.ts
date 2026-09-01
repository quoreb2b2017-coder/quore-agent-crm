/** Env helpers — Vercel-safe (no localhost fallback in production). */

function normalizeUrl(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw || raw === "0" || raw === "false" || raw === "disabled" || raw === "off") {
    return null;
  }
  return raw;
}

/** Browser Socket.io URL. Unset on Vercel until a socket host is configured. */
export function clientSocketUrl(): string | null {
  const configured = normalizeUrl(process.env.NEXT_PUBLIC_SOCKET_URL);
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") return null;
  return "http://localhost:3002";
}

/** Server → socket HTTP API (notify / emit). */
export function serverSocketUrl(): string | null {
  const internal = normalizeUrl(process.env.SOCKET_INTERNAL_URL);
  if (internal) return internal;
  const publicUrl = normalizeUrl(process.env.NEXT_PUBLIC_SOCKET_URL);
  if (publicUrl) return publicUrl;
  if (process.env.NODE_ENV === "production") return null;
  return "http://127.0.0.1:3002";
}

export function socketAuthSecret(): string {
  return (
    process.env.SOCKET_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ""
  );
}

export function isSocketConfigured(): boolean {
  return Boolean(clientSocketUrl());
}
