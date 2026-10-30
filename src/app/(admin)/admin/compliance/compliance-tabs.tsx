"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/compliance", label: "Overview" },
  { href: "/admin/compliance/controls", label: "Controls" },
  { href: "/admin/compliance/evidence", label: "Evidence" },
  { href: "/admin/compliance/risks", label: "Risks" },
  { href: "/admin/compliance/soa", label: "Statement of Applicability" },
  { href: "/admin/compliance/actions", label: "Corrective actions" },
  { href: "/admin/compliance/exceptions", label: "Exceptions" },
];

export function ComplianceTabs({ badges }: { badges: Record<string, number> }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Compliance sections" className="-mx-1 overflow-x-auto border-b">
      <ul className="flex min-w-max gap-1 px-1">
        {TABS.map((tab) => {
          const active = tab.href === "/admin/compliance" ? pathname === tab.href : pathname.startsWith(tab.href);
          const badge = badges[tab.href] ?? 0;
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
                {badge > 0 ? <span className="wt-pill px-1.5 py-0 text-[11px]" data-tone="warning">{badge}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
