export default function ChatLoading() {
  return (
    <div className="flex h-full min-h-[24rem] overflow-hidden bg-[#efeae2] dark:bg-[#0b141a]">
      <div className="hidden w-[22.5rem] border-r border-black/5 bg-white dark:border-white/10 dark:bg-[#111b21] md:block">
        <div className="border-b border-black/5 px-4 py-3 dark:border-white/10">
          <div className="h-5 w-16 animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-2 p-3">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="size-8 animate-pulse rounded-full bg-muted" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading chats…
      </div>
    </div>
  );
}
