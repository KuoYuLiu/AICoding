import Link from "next/link";
import { Brand } from "@/components/brand";
import { UserMenu } from "@/components/user-menu";
import type { Role } from "@/lib/generated/prisma/enums";

export function TeacherHeader({ name, role, current }: { name: string; role: Role; current: "review" | "usage" | null }) {
  const links = [
    { id: "review", href: "/teacher", label: "審核作答" },
    { id: "usage", href: "/teacher/usage", label: "用量與一致率" },
  ] as const;
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Brand />
          <nav aria-label="教師功能" className="flex items-center gap-1 text-sm">
            <Link href="/" className="rounded-md px-2.5 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100">
              題目
            </Link>
            {links.map((link) => (
              <Link
                key={link.id}
                href={link.href}
                aria-current={current === link.id ? "page" : undefined}
                className={`rounded-md px-2.5 py-1.5 ${
                  current === link.id
                    ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <UserMenu name={name} role={role} />
      </div>
    </header>
  );
}
