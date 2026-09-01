import { NextResponse } from "next/server";
import { signedUrlForMessage } from "@/lib/chat/send";

export async function GET(
  _request: Request,
  context: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await context.params;
  const result = await signedUrlForMessage(messageId);
  if (!result.url) {
    return NextResponse.json({ error: result.error || "Not found" }, { status: 404 });
  }
  return NextResponse.redirect(result.url);
}
