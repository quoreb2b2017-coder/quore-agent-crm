"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useLinkStatus } from "next/link";
import { ModuleIcon } from "@/components/layout/module-icon";
import { cn } from "@/lib/utils";

export function RouteSpinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-9 shrink-0 rounded-full border-[3px] border-primary/15 border-t-primary motion-safe:animate-spin",
        className
      )}
      aria-hidden
    />
  );
}

export function RouteLoading() {
  return (
    <div className="py-2" role="status" aria-label="Loading">
      <div className="flex flex-col gap-3">
        <div className="h-10 w-40 animate-pulse rounded-lg bg-muted/70" />
        <div className="h-4 w-64 max-w-full animate-pulse rounded bg-muted/60" />
        <div className="mt-2 grid gap-3 lg:grid-cols-2">
          <div className="min-h-40 animate-pulse rounded-2xl bg-muted/70" />
          <div className="min-h-40 animate-pulse rounded-2xl bg-muted/70" />
        </div>
      </div>
    </div>
  );
}

function isAppNavigation(anchor: HTMLAnchorElement, event: MouseEvent) {
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;

  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }

  let url: URL;
  try {
    url = new URL(anchor.href, window.location.href);
  } catch {
    return false;
  }

  if (url.origin !== window.location.origin) return false;
  if (url.pathname === window.location.pathname && url.search === window.location.search) {
    return false;
  }

  return true;
}

/** A request only counts as an "action" if the person did something just before it. */
const USER_ACTION_WINDOW_MS = 1500;

/**
 * Number of page loads and server actions the person is waiting for. Next's router calls
 * window.fetch, so this covers Link, router.push, filters and buttons without touching
 * each one. Prefetches and background calls (heartbeat, bell) are left out.
 */
function useUserRequestsInFlight() {
  const [inFlight, setInFlight] = useState(0);

  useEffect(() => {
    let lastUserAction = 0;
    const noteUserAction = () => {
      lastUserAction = Date.now();
    };
    const userEvents = ["pointerdown", "keydown", "change", "popstate"];
    for (const name of userEvents) window.addEventListener(name, noteUserAction, true);

    const originalFetch = window.fetch;
    window.fetch = (input, init) => {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      const isPageLoad = headers.has("rsc") && !headers.has("next-router-prefetch");
      const isServerAction = headers.has("next-action");
      if ((!isPageLoad && !isServerAction) || Date.now() - lastUserAction > USER_ACTION_WINDOW_MS) {
        return originalFetch(input, init);
      }
      setInFlight((count) => count + 1);
      return originalFetch(input, init).finally(() => setInFlight((count) => count - 1));
    };

    return () => {
      window.fetch = originalFetch;
      for (const name of userEvents) window.removeEventListener(name, noteUserAction, true);
    };
  }, []);

  return inFlight;
}

/** Floating circle while anything the person asked for is loading. Never blocks the page. */
function NavigationLoaderInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const inFlight = useUserRequestsInFlight();
  const busy = pending || inFlight > 0;

  useEffect(() => {
    setPending(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!pending) return;
    const giveUp = window.setTimeout(() => setPending(false), 8000);
    return () => window.clearTimeout(giveUp);
  }, [pending]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (!isAppNavigation(anchor, event)) return;
      setPending(true);
    }

    function onPopState() {
      setPending(true);
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  return (
    <div
      className={cn(
        "pointer-events-none fixed top-20 left-1/2 z-[60] flex size-12 -translate-x-1/2 items-center justify-center rounded-full border bg-card shadow-lg transition-opacity",
        // The short delay stops the circle flashing on loads that finish straight away.
        busy ? "opacity-100 delay-100" : "opacity-0"
      )}
      aria-hidden={!busy}
      aria-busy={busy}
      role={busy ? "status" : undefined}
      aria-label={busy ? "Loading" : undefined}
    >
      {busy ? <RouteSpinner className="size-7" /> : null}
    </div>
  );
}

export function NavigationLoader() {
  return (
    <Suspense fallback={null}>
      <NavigationLoaderInner />
    </Suspense>
  );
}

export function NavItemGlyph({ name }: { name: string }) {
  const { pending } = useLinkStatus();
  return (
    <>
      <ModuleIcon
        name={name}
        className={cn("transition-opacity duration-150", pending ? "opacity-0" : "opacity-100")}
      />
      <span
        className={cn(
          "absolute top-1/2 left-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-current/30 border-t-current transition-opacity duration-150",
          pending ? "animate-spin opacity-100" : "opacity-0"
        )}
        aria-hidden
      />
    </>
  );
}
