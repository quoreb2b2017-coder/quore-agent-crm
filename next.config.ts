import type { NextConfig } from "next";

/**
 * Baseline HTTP security headers (finding F-10).
 * A full Content-Security-Policy is tracked in the readiness backlog: it needs
 * nonce support for Next's inline scripts and should first run in
 * Report-Only mode against production traffic.
 */
const securityHeaders = [
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
