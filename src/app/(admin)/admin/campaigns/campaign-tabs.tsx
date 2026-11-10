"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Tab = { href: string; label: string; badge?: number };

export function CampaignTabs({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Campaign Operations sections" className="-mx-1 overflow-x-auto border-b">
      <ul className="flex min-w-max gap-1 px-1">
        {tabs.map((tab) => {
          const active =
            tab.href === "/admin/campaigns"
              ? pathname === tab.href
              : tab.href === "/admin/campaigns/all"
                ? pathname === tab.href || pathname === "/admin/campaigns/new" || /^\/admin\/campaigns\/[0-9a-f-]{36}/.test(pathname)
                : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-1.5 border-b-2 px-3 text-sm whitespace-nowrap transition",
                  active ? "border-[#00a67e] font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
                {tab.badge ? <span className="wt-pill px-1.5 py-0 text-[11px]" data-tone="warning">{tab.badge}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
