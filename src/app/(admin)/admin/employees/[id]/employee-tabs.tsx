"use client";

import Link from "next/link";
import { Clock3, Contact, History, ShieldCheck, User } from "lucide-react";
import { cn } from "@/lib/utils";

export type EmployeeTab = "history" | "profile" | "personal" | "shift" | "access";

export function EmployeeTabs({
  employeeId,
  active,
}: {
  employeeId: string;
  active: EmployeeTab;
}) {
  const base = `/admin/employees/${employeeId}`;
  const items = [
    { id: "history" as const, href: base, label: "History", icon: History },
    { id: "profile" as const, href: `${base}?tab=profile`, label: "Profile", icon: User },
    { id: "personal" as const, href: `${base}?tab=personal`, label: "Personal details", icon: Contact },
    { id: "shift" as const, href: `${base}?tab=shift`, label: "Shift & overtime", icon: Clock3 },
    { id: "access" as const, href: `${base}?tab=access`, label: "Access & security", icon: ShieldCheck },
  ];

  return (
    <nav className="flex overflow-x-auto border-b px-2">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          aria-current={active === item.id ? "page" : undefined}
          className={cn(
            "relative inline-flex h-12 shrink-0 items-center gap-2 px-4 text-sm font-medium whitespace-nowrap transition",
            active === item.id
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <item.icon className="size-4" />
          {item.label}
          {active === item.id ? (
            <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" />
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
