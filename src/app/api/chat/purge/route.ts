import { NextResponse } from "next/server";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { purgeExpiredChat } from "@/lib/chat/send";

export async function POST() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  await purgeExpiredChat();
  return NextResponse.json({ ok: true });
}
