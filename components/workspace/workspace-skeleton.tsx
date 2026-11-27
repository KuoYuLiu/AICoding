export function WorkspaceSkeleton() {
  return (
    <div className="flex h-screen flex-col" aria-busy="true" aria-label="載入解題畫面">
      <div className="h-12 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950" />
      <div className="grid flex-1 animate-pulse gap-2 p-2 lg:grid-cols-[28fr_44fr_28fr]">
        <div className="rounded-lg bg-zinc-200/70 dark:bg-zinc-800/70" />
        <div className="hidden rounded-lg bg-zinc-200/70 lg:block dark:bg-zinc-800/70" />
        <div className="hidden rounded-lg bg-zinc-200/70 lg:block dark:bg-zinc-800/70" />
      </div>
    </div>
  );
}
