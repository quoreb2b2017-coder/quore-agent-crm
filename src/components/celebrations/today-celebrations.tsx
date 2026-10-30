import { celebrationDateIso, getTodayCelebrations } from "@/lib/queries/celebrations";
import { CelebrationPopup } from "./celebration-popup";

export async function TodayCelebrations({ viewerId }: { viewerId: string }) {
  const todayIso = celebrationDateIso();
  const celebrations = await getTodayCelebrations(todayIso).catch(() => []);
  if (!celebrations.length) return null;
  return <CelebrationPopup celebrations={celebrations} viewerId={viewerId} todayIso={todayIso} />;
}
