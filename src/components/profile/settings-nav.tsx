"use client";

import Link from "next/link";
import { KeyRound, User } from "lucide-react";
import { cn } from "@/lib/utils";

export function SettingsNav({
  profileHref,
  passwordHref,
  active,
}: {
  profileHref: string;
  passwordHref: string;
  active: "profile" | "password";
}) {
  const items = [
    { id: "profile" as const, href: profileHref, label: "Profile", icon: User },
    { id: "password" as const, href: passwordHref, label: "Password", icon: KeyRound },
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
