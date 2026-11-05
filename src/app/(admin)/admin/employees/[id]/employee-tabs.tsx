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
    <nav className="flex divide-x overflow-x-auto border-b bg-muted">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          aria-current={active === item.id ? "page" : undefined}
          className={cn(
            "inline-flex h-11 shrink-0 items-center gap-2 px-5 text-[13px] whitespace-nowrap transition-colors",
            active === item.id
              ? "bg-primary font-semibold text-primary-foreground"
              : "font-medium text-foreground hover:bg-accent hover:text-primary"
          )}
        >
          <item.icon className="size-4" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
