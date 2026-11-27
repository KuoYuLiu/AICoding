import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 rounded-md font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
      <span
        aria-hidden
        className="grid size-7 place-items-center rounded-lg bg-indigo-600 font-mono text-[11px] font-bold text-white shadow-sm"
      >
        {"</>"}
      </span>
      {!compact && <span className="text-[15px]">AICoding</span>}
    </Link>
  );
}
