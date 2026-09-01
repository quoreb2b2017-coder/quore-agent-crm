import { cn } from "@/lib/utils";

function Block({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-muted/70", className)} />;
}

export function DashboardPageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <Block className="h-24 w-full" />
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Block className="min-h-[18rem]" />
        <Block className="min-h-[18rem]" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Block className="h-24" />
        <Block className="h-24" />
        <Block className="h-24" />
        <Block className="h-24" />
      </div>
    </div>
  );
}

export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 py-1" aria-hidden>
      <Block className="h-10 w-48" />
      <Block className="h-4 w-72 max-w-full" />
      <div className="mt-2 flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, index) => (
          <Block key={index} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
