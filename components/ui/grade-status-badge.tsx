import type { GradeStatus } from "@/lib/generated/prisma/enums";

const styles: Record<GradeStatus, { label: string; className: string }> = {
  PENDING: { label: "待評分", className: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300" },
  AI_GRADED: { label: "AI 已評", className: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
  TEACHER_CONFIRMED: { label: "教師已確認", className: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  PUBLISHED: { label: "已公佈", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
};

export function GradeStatusBadge({ status }: { status: GradeStatus | null }) {
  if (!status) return <span className="text-xs text-zinc-400">—</span>;
  const style = styles[status];
  return (
    <span data-testid="grade-status" className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}>
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />
      {style.label}
    </span>
  );
}
