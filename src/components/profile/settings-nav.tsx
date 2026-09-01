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
    <nav className="flex border-b px-2">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className={cn(
            "relative inline-flex h-12 items-center gap-2 px-4 text-sm font-medium transition",
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
