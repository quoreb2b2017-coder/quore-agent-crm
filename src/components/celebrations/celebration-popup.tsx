"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Cake, PartyPopper, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ordinal, yearsLabel, type Celebration } from "@/lib/celebrations";
import { cn } from "@/lib/utils";

const CONFETTI_COLORS = ["#f43f5e", "#f59e0b", "#10b981", "#3b82f6", "#a855f7", "#ec4899"];
const CONFETTI = Array.from({ length: 28 }, (_, index) => ({
  left: (index * 37) % 100,
  delay: ((index * 13) % 28) / 10,
  drift: ((index % 7) - 3) * 14,
  color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
  round: index % 3 === 0,
}));

function firstName(fullName: string) {
  const skip = new Set(["md", "md.", "mohd", "mohd.", "mr", "mr.", "mrs", "mrs.", "ms", "ms.", "dr", "dr."]);
  const parts = fullName.trim().split(/\s+/);
  return parts.find((part) => !skip.has(part.toLowerCase())) ?? parts[0] ?? fullName;
}

function initials(fullName: string) {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function describe(item: Celebration) {
  if (item.kind === "birthday") {
    return item.years ? `Turns ${item.years} today` : "Birthday today";
  }
  return `Completes ${yearsLabel(item.years ?? 1)} with us`;
}

function storageKey(viewerId: string, todayIso: string) {
  return `celebrations-seen:${viewerId}:${todayIso}`;
}

export function CelebrationPopup({
  celebrations,
  viewerId,
  todayIso,
}: {
  celebrations: Celebration[];
  viewerId: string;
  todayIso: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!celebrations.length) return;
    try {
      if (window.localStorage.getItem(storageKey(viewerId, todayIso))) return;
    } catch {
      // Storage can be blocked; still show the popup.
    }
    const timer = window.setTimeout(() => setOpen(true), 700);
    return () => window.clearTimeout(timer);
  }, [celebrations.length, viewerId, todayIso]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      try {
        window.localStorage.setItem(storageKey(viewerId, todayIso), "1");
      } catch {
        // Ignore storage errors.
      }
    }
  }

  if (!celebrations.length) return null;

  const mine = celebrations.filter((item) => item.employeeId === viewerId);
  const others = celebrations.filter((item) => item.employeeId !== viewerId);
  const myBirthday = mine.find((item) => item.kind === "birthday");
  const myAnniversary = mine.find((item) => item.kind === "anniversary");
  const myName = mine[0] ? firstName(mine[0].fullName) : "";

  let HeroIcon = PartyPopper;
  let title = "Let's celebrate today!";
  let subtitle =
    others.length === 1
      ? `Wish ${firstName(others[0].fullName)} on their special day.`
      : "Wish your teammates on their special day.";

  if (myBirthday && myAnniversary) {
    HeroIcon = Cake;
    title = `Happy Birthday, ${myName}!`;
    subtitle = `Double celebration: your birthday and ${yearsLabel(myAnniversary.years ?? 1)} with QuoreB2B. Thank you for everything you do.`;
  } else if (myBirthday) {
    HeroIcon = Cake;
    title = `Happy Birthday, ${myName}!`;
    subtitle = "Wishing you a wonderful year ahead, from the whole QuoreB2B team.";
  } else if (myAnniversary) {
    HeroIcon = Trophy;
    const years = myAnniversary.years ?? 1;
    title = `Happy ${ordinal(years)} Work Anniversary, ${myName}!`;
    subtitle = `You have completed ${yearsLabel(years)} with QuoreB2B. Thank you for your hard work and dedication.`;
  } else if (others.length === 1) {
    const only = others[0];
    HeroIcon = only.kind === "birthday" ? Cake : Trophy;
    title =
      only.kind === "birthday"
        ? `It's ${firstName(only.fullName)}'s birthday!`
        : `${firstName(only.fullName)} completes ${yearsLabel(only.years ?? 1)}!`;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <div className="relative overflow-hidden bg-linear-to-br from-amber-100 via-rose-100 to-violet-100 px-6 pt-8 pb-6 text-center dark:from-amber-500/15 dark:via-rose-500/15 dark:to-violet-500/15">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {CONFETTI.map((piece, index) => (
              <span
                key={index}
                className={cn("confetti-piece absolute top-0 block size-2", piece.round ? "rounded-full" : "rounded-[2px]")}
                style={
                  {
                    left: `${piece.left}%`,
                    backgroundColor: piece.color,
                    animationDelay: `${piece.delay}s`,
                    "--confetti-drift": `${piece.drift}px`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
          <div className="celebrate-pop relative mx-auto flex size-16 items-center justify-center rounded-full bg-white shadow-lg ring-4 ring-white/60 dark:bg-background">
            <HeroIcon className="size-8 text-rose-500" />
          </div>
          <DialogTitle className="relative mt-4 text-xl font-semibold leading-tight">{title}</DialogTitle>
          <DialogDescription className="relative mx-auto mt-2 max-w-sm text-sm text-foreground/70">
            {subtitle}
          </DialogDescription>
        </div>

        {others.length ? (
          <div className="grid gap-2 px-5 py-4">
            {mine.length ? (
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Also celebrating today
              </p>
            ) : null}
            <ul className="grid max-h-56 gap-2 overflow-y-auto">
              {others.map((item) => (
                <li
                  key={`${item.employeeId}-${item.kind}`}
                  className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      item.kind === "birthday"
                        ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                    )}
                  >
                    {initials(item.fullName)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.fullName}</p>
                    <p className="text-xs text-muted-foreground">{describe(item)}</p>
                  </div>
                  {item.kind === "birthday" ? (
                    <Cake className="size-4 shrink-0 text-rose-500" />
                  ) : (
                    <Trophy className="size-4 shrink-0 text-amber-500" />
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex justify-center border-t bg-muted/40 px-5 py-3">
          <Button onClick={() => handleOpenChange(false)} className="min-w-32">
            <PartyPopper className="size-4" />
            {mine.length ? "Thank you!" : "Celebrate"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
