import { signOut } from "@/auth";
import type { Role } from "@/lib/generated/prisma/enums";

function initials(name: string): string {
  const trimmed = name.trim();
  // CJK names: last character reads naturally (e.g. 「明」); Latin names: first letters.
  if (/[㐀-鿿]/.test(trimmed)) return trimmed.slice(-1);
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function UserMenu({ name, role }: { name: string; role: Role }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={
          role === "TEACHER"
            ? "hidden rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 sm:inline dark:bg-amber-500/15 dark:text-amber-300"
            : "hidden rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 sm:inline dark:bg-zinc-800 dark:text-zinc-300"
        }
      >
        {role === "TEACHER" ? "教師" : "學生"}
      </span>
      <span className="hidden max-w-40 truncate text-sm text-zinc-700 md:inline dark:text-zinc-300">{name}</span>
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200"
      >
        {initials(name)}
      </span>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className="rounded-md px-2.5 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          登出
        </button>
      </form>
    </div>
  );
}
