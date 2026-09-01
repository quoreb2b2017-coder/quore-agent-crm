import type { ReactNode } from "react";

export function DashboardHero({
  greeting,
  firstName,
  roleLabel,
  subtitle,
  actions,
  compact = false,
  flush = false,
}: {
  greeting: string;
  firstName: string;
  roleLabel?: string;
  subtitle?: string;
  actions?: ReactNode;
  compact?: boolean;
  flush?: boolean;
}) {
  const kicker = [subtitle, roleLabel].filter(Boolean).join(" · ");

  return (
    <section
      className={
        flush
          ? "dash-hero dash-hero-compact relative overflow-hidden rounded-none px-4 py-3.5 text-white sm:px-5"
          : compact
            ? "dash-hero dash-hero-compact relative overflow-hidden rounded-2xl px-4 py-4 text-white sm:px-5"
            : "dash-hero relative overflow-hidden rounded-3xl px-5 py-6 text-white shadow-lg sm:px-7 sm:py-7"
      }
    >
      <div className="dash-hero-grid pointer-events-none absolute inset-0" />
      <div className="dash-hero-shine pointer-events-none absolute inset-x-0 top-0 h-px" />
      <div
        className={
          compact
            ? "relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            : "relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"
        }
      >
        <div className="min-w-0">
          {kicker ? (
            <p className="text-[11px] font-medium tracking-[0.14em] text-white/60 uppercase">
              {kicker}
            </p>
          ) : null}
          <h2
            className={
              compact
                ? "mt-0.5 text-xl font-semibold tracking-tight text-balance sm:text-2xl"
                : "mt-1 text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
            }
          >
            {greeting}, {firstName}
          </h2>
        </div>
        {actions ? <div className="relative shrink-0">{actions}</div> : null}
      </div>
    </section>
  );
}
