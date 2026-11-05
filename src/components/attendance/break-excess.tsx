import { formatExcess } from "@/lib/format";
import { BREAK_SLOTS, formatBreakType, type BreakExcess } from "@/lib/shift";

export function breakExcessParts(excess: BreakExcess) {
  const parts = BREAK_SLOTS.filter((slot) => excess[slot] > 0).map(
    (slot) => `${formatBreakType(slot)} +${formatExcess(excess[slot])}`
  );
  if (excess.washroom > 0) parts.push(`Washroom +${formatExcess(excess.washroom)}`);
  return parts;
}
