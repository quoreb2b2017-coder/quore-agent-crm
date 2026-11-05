/** Shared look for Excel-style tables. The Table inside needs `border-separate border-spacing-0`. */
export const sheetHeadClassName =
  "h-9 border-r border-b border-ink-border bg-ink px-3 text-[11px] font-semibold tracking-wider text-ink-foreground";
export const sheetCellClassName = "h-10 border-r border-b px-3 py-1 text-[13px] tabular-nums";
// Opaque colours: frozen cells inherit them and sit over scrolled content.
export const sheetRowClassName = "bg-card even:bg-muted hover:bg-accent has-aria-expanded:bg-accent";
