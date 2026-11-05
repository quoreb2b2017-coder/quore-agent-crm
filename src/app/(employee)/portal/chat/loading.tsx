export default function ChatLoading() {
  return (
    <div className="flex h-full min-h-[24rem] overflow-hidden bg-muted">
      <div className="hidden w-80 border-r bg-card lg:block xl:w-96">
        <div className="border-b bg-muted px-3 py-3">
          <div className="h-5 w-16 animate-pulse rounded bg-border" />
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
