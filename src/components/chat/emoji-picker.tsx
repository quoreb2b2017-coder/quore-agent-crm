"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type EmojiItem = { char: string; name: string };

const GROUPS: { id: string; label: string; items: EmojiItem[] }[] = [
  {
    id: "smileys",
    label: "Smileys",
    items: [
      { char: "😀", name: "grinning" },
      { char: "😁", name: "beaming" },
      { char: "😂", name: "joy tears" },
      { char: "🤣", name: "rofl" },
      { char: "😊", name: "smile blush" },
      { char: "😇", name: "innocent halo" },
      { char: "🙂", name: "slight smile" },
      { char: "😉", name: "wink" },
      { char: "😍", name: "heart eyes" },
      { char: "🥰", name: "smiling hearts" },
      { char: "😘", name: "kiss" },
      { char: "😋", name: "yum" },
      { char: "😜", name: "wink tongue" },
      { char: "🤪", name: "zany" },
      { char: "🤗", name: "hug" },
      { char: "🤩", name: "star struck" },
      { char: "🤔", name: "thinking" },
      { char: "🤨", name: "raised eyebrow" },
      { char: "😐", name: "neutral" },
      { char: "😑", name: "expressionless" },
      { char: "😴", name: "sleeping" },
      { char: "🤤", name: "drool" },
      { char: "😪", name: "sleepy" },
      { char: "😮", name: "open mouth" },
      { char: "😲", name: "astonished" },
      { char: "😳", name: "flushed" },
      { char: "🥺", name: "pleading" },
      { char: "😢", name: "cry" },
      { char: "😭", name: "sob" },
      { char: "😤", name: "triumph" },
      { char: "😡", name: "angry" },
      { char: "🤬", name: "cursing" },
      { char: "🤯", name: "exploding head" },
      { char: "🥶", name: "cold" },
      { char: "🥵", name: "hot" },
      { char: "🤮", name: "vomit" },
      { char: "🤧", name: "sneeze" },
      { char: "🤒", name: "sick" },
      { char: "🤠", name: "cowboy" },
      { char: "🥳", name: "party" },
      { char: "😎", name: "cool sunglasses" },
      { char: "🤓", name: "nerd" },
      { char: "🧐", name: "monocle" },
      { char: "😏", name: "smirk" },
      { char: "😒", name: "unamused" },
      { char: "🙄", name: "eye roll" },
      { char: "😬", name: "grimace" },
      { char: "😶", name: "no mouth" },
    ],
  },
  {
    id: "gestures",
    label: "Gestures",
    items: [
      { char: "👍", name: "thumbs up" },
      { char: "👎", name: "thumbs down" },
      { char: "👏", name: "clap" },
      { char: "🙌", name: "raised hands" },
      { char: "👋", name: "wave" },
      { char: "🤝", name: "handshake" },
      { char: "🙏", name: "folded thanks please" },
      { char: "✌️", name: "victory" },
      { char: "🤞", name: "crossed fingers" },
      { char: "🤟", name: "love you" },
      { char: "🤘", name: "rock" },
      { char: "👌", name: "ok" },
      { char: "🤌", name: "pinched" },
      { char: "👉", name: "point right" },
      { char: "👈", name: "point left" },
      { char: "👆", name: "point up" },
      { char: "👇", name: "point down" },
      { char: "👊", name: "fist" },
      { char: "✊", name: "raised fist" },
      { char: "💪", name: "muscle" },
      { char: "🫶", name: "heart hands" },
      { char: "👐", name: "open hands" },
      { char: "🤲", name: "palms up" },
      { char: "🫡", name: "salute" },
      { char: "👀", name: "eyes" },
      { char: "🧠", name: "brain" },
      { char: "✅", name: "check" },
      { char: "❌", name: "cross" },
    ],
  },
  {
    id: "hearts",
    label: "Hearts",
    items: [
      { char: "❤️", name: "red heart" },
      { char: "🧡", name: "orange heart" },
      { char: "💛", name: "yellow heart" },
      { char: "💚", name: "green heart" },
      { char: "💙", name: "blue heart" },
      { char: "💜", name: "purple heart" },
      { char: "🖤", name: "black heart" },
      { char: "🤍", name: "white heart" },
      { char: "🤎", name: "brown heart" },
      { char: "💔", name: "broken heart" },
      { char: "❤️‍🔥", name: "heart on fire" },
      { char: "💕", name: "two hearts" },
      { char: "💞", name: "revolving hearts" },
      { char: "💓", name: "beating heart" },
      { char: "💗", name: "growing heart" },
      { char: "💖", name: "sparkling heart" },
      { char: "💘", name: "heart arrow" },
      { char: "💝", name: "heart ribbon" },
      { char: "✨", name: "sparkles" },
      { char: "⭐", name: "star" },
      { char: "🌟", name: "glowing star" },
      { char: "🔥", name: "fire" },
      { char: "💯", name: "hundred" },
    ],
  },
  {
    id: "work",
    label: "Work",
    items: [
      { char: "💼", name: "briefcase" },
      { char: "💻", name: "laptop" },
      { char: "🖥️", name: "computer" },
      { char: "📱", name: "phone" },
      { char: "📧", name: "email" },
      { char: "📨", name: "incoming envelope" },
      { char: "📅", name: "calendar" },
      { char: "📌", name: "pin" },
      { char: "📝", name: "memo" },
      { char: "📂", name: "folder" },
      { char: "📎", name: "paperclip" },
      { char: "📊", name: "chart" },
      { char: "✅", name: "done" },
      { char: "☑️", name: "ballot" },
      { char: "🕒", name: "clock" },
      { char: "🚀", name: "rocket" },
      { char: "💡", name: "idea" },
      { char: "🛠️", name: "tools" },
      { char: "🔒", name: "lock" },
      { char: "🔑", name: "key" },
      { char: "☎️", name: "telephone" },
      { char: "📞", name: "receiver" },
      { char: "🧑‍💻", name: "technologist" },
      { char: "🙋", name: "raising hand" },
    ],
  },
  {
    id: "food",
    label: "Food",
    items: [
      { char: "☕", name: "coffee" },
      { char: "🍵", name: "tea" },
      { char: "🥤", name: "cup" },
      { char: "🍕", name: "pizza" },
      { char: "🍔", name: "burger" },
      { char: "🍟", name: "fries" },
      { char: "🌮", name: "taco" },
      { char: "🌯", name: "burrito" },
      { char: "🍜", name: "noodles" },
      { char: "🍣", name: "sushi" },
      { char: "🍩", name: "donut" },
      { char: "🍪", name: "cookie" },
      { char: "🎂", name: "cake" },
      { char: "🍫", name: "chocolate" },
      { char: "🍿", name: "popcorn" },
      { char: "🥗", name: "salad" },
      { char: "🍎", name: "apple" },
      { char: "🍌", name: "banana" },
      { char: "🍇", name: "grapes" },
      { char: "🍉", name: "watermelon" },
    ],
  },
  {
    id: "more",
    label: "More",
    items: [
      { char: "🎉", name: "party popper" },
      { char: "🎊", name: "confetti" },
      { char: "🎈", name: "balloon" },
      { char: "🎁", name: "gift" },
      { char: "🏆", name: "trophy" },
      { char: "🥇", name: "gold medal" },
      { char: "⚽", name: "soccer" },
      { char: "🎵", name: "music" },
      { char: "🎶", name: "notes" },
      { char: "📷", name: "camera" },
      { char: "🎥", name: "movie" },
      { char: "📍", name: "location" },
      { char: "🏠", name: "home" },
      { char: "🚗", name: "car" },
      { char: "✈️", name: "plane" },
      { char: "🌙", name: "moon" },
      { char: "☀️", name: "sun" },
      { char: "🌈", name: "rainbow" },
      { char: "🌸", name: "blossom" },
      { char: "🍀", name: "clover" },
      { char: "🐶", name: "dog" },
      { char: "🐱", name: "cat" },
      { char: "⚠️", name: "warning" },
      { char: "❗", name: "exclamation" },
      { char: "❓", name: "question" },
    ],
  },
];

const RECENT_KEY = "worktrack-chat-emojis";

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string").slice(0, 24) : [];
  } catch {
    return [];
  }
}

function saveRecent(char: string) {
  const next = [char, ...loadRecent().filter((item) => item !== char)].slice(0, 24);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export function ChatEmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [query, setQuery] = useState("");
  const [groupId, setGroupId] = useState("smileys");
  const [recent, setRecent] = useState<string[]>(() => (typeof window === "undefined" ? [] : loadRecent()));

  const all = useMemo(() => GROUPS.flatMap((group) => group.items), []);
  const needle = query.trim().toLowerCase();
  const shown = useMemo(() => {
    if (needle) {
      return all.filter((item) => item.name.includes(needle) || item.char === needle);
    }
    if (groupId === "recent") {
      return recent
        .map((char) => all.find((item) => item.char === char) || { char, name: char })
        .filter(Boolean);
    }
    return GROUPS.find((group) => group.id === groupId)?.items ?? GROUPS[0].items;
  }, [all, groupId, needle, recent]);

  function pick(char: string) {
    saveRecent(char);
    setRecent(loadRecent());
    onPick(char);
  }

  return (
    <div className="flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
      <label className="relative block">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search emoji"
          className="h-8 pl-8"
        />
      </label>
      <div className="flex gap-1 overflow-x-auto pb-0.5">
        <button
          type="button"
          onClick={() => {
            setGroupId("recent");
            setQuery("");
          }}
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
            groupId === "recent" && !needle ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
          )}
        >
          Recent
        </button>
        {GROUPS.map((group) => (
          <button
            key={group.id}
            type="button"
            onClick={() => {
              setGroupId(group.id);
              setQuery("");
            }}
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
              groupId === group.id && !needle ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
            )}
          >
            {group.label}
          </button>
        ))}
      </div>
      <div className="grid max-h-52 grid-cols-8 gap-0.5 overflow-y-auto pr-1">
        {shown.length === 0 ? (
          <p className="col-span-8 py-8 text-center text-xs text-muted-foreground">No emoji match</p>
        ) : (
          shown.map((item) => (
            <button
              key={`${item.char}-${item.name}`}
              type="button"
              title={item.name}
              onClick={() => pick(item.char)}
              className="flex size-8 items-center justify-center rounded-md text-xl leading-none hover:bg-muted"
            >
              {item.char}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
