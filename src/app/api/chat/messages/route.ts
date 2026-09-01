import { NextResponse } from "next/server";
import { deliverChatMessage } from "@/lib/chat/send";

export async function POST(request: Request) {
  const form = await request.formData();
  const peerEmployeeId = String(form.get("peerId") || "");
  const body = String(form.get("body") || "");
  const uploaded = form.get("file");
  const file = uploaded instanceof File ? uploaded : null;

  const result = await deliverChatMessage({ peerEmployeeId, body, file });
  return NextResponse.json(result, { status: result.error ? 400 : 200 });
}
