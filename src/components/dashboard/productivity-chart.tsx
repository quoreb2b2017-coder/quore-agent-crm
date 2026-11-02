"use client";

import dynamic from "next/dynamic";

/**
 * The chart library (recharts, ~100 KB compressed) loads only where a chart is
 * shown. Recharts measures its container in the browser, so it renders nothing
 * on the server anyway; the placeholder keeps the same 240px height.
 */
export const ProductivityChart = dynamic(
  () => import("./productivity-chart-impl").then((mod) => mod.ProductivityChart),
  { ssr: false, loading: () => <div style={{ height: 240 }} aria-hidden /> }
);
