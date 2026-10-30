import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/compliance/labels";

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section aria-labelledby={headingId} className={cn("min-w-0 overflow-hidden rounded-xl border bg-card", className)}>
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-5 py-3.5">
          <div className="min-w-0">
            <h2 id={headingId} className="text-[15px] font-semibold">{title}</h2>
            {description ? <p className="mt-0.5 text-[12.5px] text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function Pill({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("wt-pill", className)} data-tone={tone}>
      {children}
    </span>
  );
}

export function KpiStrip({
  items,
}: {
  items: { label: string; value: ReactNode; sub?: ReactNode; subTone?: Tone; href?: string }[];
}) {
  const toneColor: Record<Tone, string> = {
    success: "text-[#067647]",
    warning: "text-[#b54708]",
    danger: "text-[#b42318]",
    info: "text-[#2e5aac]",
    neutral: "text-muted-foreground",
    brand: "text-primary",
  };
  return (
    <section
      aria-label="Key numbers"
      className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card sm:grid-cols-3 xl:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]"
    >
      {items.map((item) => {
        const body = (
          <>
            <span className="text-[12.5px] text-muted-foreground">{item.label}</span>
            <span className="text-[26px] leading-tight font-semibold tracking-[-0.02em] tabular-nums">{item.value}</span>
            {item.sub ? <span className={cn("text-[12.5px]", toneColor[item.subTone ?? "neutral"])}>{item.sub}</span> : null}
          </>
        );
        return item.href ? (
          <a key={item.label} href={item.href} className="-mr-px -mb-px flex flex-col gap-1 border-r border-b px-[18px] py-4 transition hover:bg-muted/40">
            {body}
          </a>
        ) : (
          <div key={item.label} className="-mr-px -mb-px flex flex-col gap-1 border-r border-b px-[18px] py-4">
            {body}
          </div>
        );
      })}
    </section>
  );
}

export function SegmentBar({
  segments,
  label,
  dark = false,
}: {
  segments: { label: string; count: number; color: string }[];
  label: string;
  dark?: boolean;
}) {
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  return (
    <div className="flex flex-col gap-3">
      <div role="img" aria-label={label} className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {total === 0 ? (
          <span className={cn("flex-1", dark ? "bg-ink-border" : "bg-muted")} />
        ) : (
          segments.map((s) => <span key={s.label} style={{ flex: `${s.count} 1 0`, background: s.color }} />)
        )}
      </div>
      <ul className="grid grid-cols-1 gap-x-5 gap-y-1.5 text-[12.5px] sm:grid-cols-2">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-[2px]" style={{ background: s.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{s.label}</span>
            <span className={cn("tabular-nums", dark ? "text-white" : "font-medium")}>{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
