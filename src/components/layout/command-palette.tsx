"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ModuleIcon } from "@/components/layout/module-icon";
import { searchPeople, type PersonResult } from "@/lib/actions/search";
import type { ModuleDefinition } from "@/lib/permissions/modules";
import { cn } from "@/lib/utils";

export type PaletteAction = { label: string; hint: string; href: string; icon: string };

type Entry = { key: string; group: string; label: string; hint: string; href: string; icon: string };

const OPEN_EVENT = "worktrack:open-palette";

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function CommandPalette({
  modules,
  actions,
  canSearchPeople,
}: {
  modules: ModuleDefinition[];
  actions: PaletteAction[];
  canSearchPeople: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<PersonResult[]>([]);
  const [active, setActive] = useState(0);
  const [searching, startSearch] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  function onQueryChange(value: string) {
    setQuery(value);
    setActive(0);
    if (!canSearchPeople || value.trim().length < 2) {
      setPeople([]);
      return;
    }
    startSearch(async () => {
      const found = await searchPeople(value);
      setPeople(found);
    });
  }

  const entries = useMemo<Entry[]>(() => {
    const q = query.trim().toLowerCase();
    const match = (text: string) => !q || text.toLowerCase().includes(q);
    const list: Entry[] = [];
    for (const action of actions) {
      if (match(`${action.label} ${action.hint}`)) {
        list.push({ key: `a:${action.href}:${action.label}`, group: "Suggested", ...action });
      }
    }
    for (const person of people) {
      list.push({
        key: `p:${person.id}`,
        group: "People",
        label: person.name,
        hint: `${person.code} · ${person.role}`,
        href: person.href,
        icon: "user",
      });
    }
    for (const mod of modules) {
      if (match(mod.label)) {
        list.push({ key: `m:${mod.key}`, group: "Go to", label: mod.label, hint: "Page", href: mod.href, icon: mod.icon });
      }
    }
    return list;
  }, [actions, modules, people, query]);

  function go(entry: Entry | undefined) {
    if (!entry) return;
    setOpen(false);
    setQuery("");
    setPeople([]);
    router.push(entry.href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(entries.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(entries[active]);
    }
  }

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let lastGroup = "";

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) {
          setQuery("");
          setPeople([]);
          setActive(0);
        }
      }}
    >
      <DialogContent showCloseButton={false} className="top-24 translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-[620px]">
        <DialogTitle className="sr-only">Search and jump</DialogTitle>
        <div className="flex items-center gap-2.5 border-b px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={canSearchPeople ? "Search people, pages or actions…" : "Search pages or actions…"}
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={entries[active] ? `palette-${active}` : undefined}
            className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
          {searching ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden /> : null}
          <kbd className="wt-kbd">Esc</kbd>
        </div>
        <div id="palette-list" role="listbox" ref={listRef} className="max-h-[min(420px,60vh)] overflow-y-auto p-2">
          {entries.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              {searching ? "Searching…" : "Nothing matches. Try a name, an employee code or a page."}
            </p>
          ) : (
            entries.map((entry, index) => {
              const header = entry.group !== lastGroup ? entry.group : null;
              lastGroup = entry.group;
              return (
                <div key={entry.key}>
                  {header ? (
                    <p className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-[0.07em] text-muted-foreground uppercase">
                      {header}
                    </p>
                  ) : null}
                  <button
                    id={`palette-${index}`}
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    data-index={index}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(entry)}
                    className={cn(
                      "flex min-h-10 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm",
                      index === active ? "bg-accent text-accent-foreground" : "text-foreground"
                    )}
                  >
                    <ModuleIcon name={entry.icon} className="text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                    <span className="truncate text-xs text-muted-foreground">{entry.hint}</span>
                    {index === active ? <CornerDownLeft className="size-3.5 text-muted-foreground" aria-hidden /> : null}
                  </button>
                </div>
              );
            })
          )}
        </div>
        <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
          You only see pages and people your role can open. ↑ ↓ to move, Enter to open.
        </p>
      </DialogContent>
    </Dialog>
  );
}
