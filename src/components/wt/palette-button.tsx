"use client";

import { Command } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openCommandPalette } from "@/components/layout/command-palette";

export function PaletteButton() {
  return (
    <Button variant="outline" className="h-9 bg-card" onClick={openCommandPalette}>
      <Command className="size-3.5" aria-hidden />
      Quick action
      <kbd className="wt-kbd ml-1 hidden sm:inline">⌘K</kbd>
    </Button>
  );
}
