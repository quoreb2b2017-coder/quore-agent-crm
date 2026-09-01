import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { getChatBootstrap } from "@/lib/queries/chat";
import { ChatWorkspace } from "@/components/chat/chat-workspace";

export default async function PortalChatPage({
  searchParams,
}: {
  searchParams: Promise<{ with?: string | string[] }>;
}) {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return null;

  const params = await searchParams;
  const peerId = typeof params.with === "string" ? params.with : null;
  const bootstrap = await getChatBootstrap(peerId);
  if (!bootstrap) return null;

  return <ChatWorkspace bootstrap={bootstrap} />;
}
