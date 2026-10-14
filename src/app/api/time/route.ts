import { NextResponse } from "next/server";
import { ensureGoogleTime } from "@/lib/google-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const now = await ensureGoogleTime();
  return NextResponse.json(
    { utc: now.toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
