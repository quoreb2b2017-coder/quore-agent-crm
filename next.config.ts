import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/** Supabase (API, storage files, realtime) and the socket host are the only outside addresses the app talks to. */
function originsFor(raw: string | undefined) {
  if (!raw) return [];
  try {
    const url = new URL(raw);
    const socket = url.protocol === "https:" ? "wss:" : "ws:";
    return [url.origin, `${socket}//${url.host}`];
  } catch {
    return [];
  }
}

const connectSources = [
  "'self'",
  ...originsFor(process.env.NEXT_PUBLIC_SUPABASE_URL),
  ...originsFor(process.env.NEXT_PUBLIC_SOCKET_URL),
  ...(isDev ? originsFor("http://localhost:3002") : []),
];
const supabaseOrigin = originsFor(process.env.NEXT_PUBLIC_SUPABASE_URL)[0] ?? "";

/**
 * Content-Security-Policy without nonces (Next.js guide, "Without Nonces"), so pages stay cacheable.
 * It ships as Report-Only: the browser console lists anything it would block, nothing is blocked.
 * After a week with no reports on the live site, set CSP_ENFORCE=true on Vercel to turn it on.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigin}`.trim(),
  `media-src 'self' blob: ${supabaseOrigin}`.trim(),
  "font-src 'self' data:",
  `connect-src ${connectSources.join(" ")}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

/** Baseline HTTP security headers (finding F-10) plus the Content-Security-Policy above. */
const securityHeaders = [
  {
    key: process.env.CSP_ENFORCE === "true" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
    value: contentSecurityPolicy,
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Dev mode prints every Server Function call with its arguments. That would put sign-in
  // passwords and browser push keys in the terminal, so it is off.
  logging: { serverFunctions: false },
  serverExternalPackages: ["exceljs"],
  experimental: {
    // radix-ui is one big entry file; load only the parts in use.
    optimizePackageImports: ["radix-ui"],
    // Going back to a page within 30 seconds is instant. Saving anything still refreshes it.
    // A page prefetched on hover is kept 1 minute, not the default 5, so it is not shown stale.
    staleTimes: { dynamic: 30, static: 60 },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
