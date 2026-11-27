import type { AttemptStatus } from "@/lib/generated/prisma/enums";

const styles: Record<AttemptStatus | "NOT_STARTED", { label: string; className: string }> = {
  NOT_STARTED: { label: "未開始", className: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300" },
  IN_PROGRESS: { label: "作答中", className: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  COMPLETED: { label: "已完成", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  INCOMPLETE: { label: "未完成", className: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
};

export function StatusBadge({ status }: { status: AttemptStatus | null }) {
  const style = styles[status ?? "NOT_STARTED"];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}>
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />
      {style.label}
    </span>
  );
}
