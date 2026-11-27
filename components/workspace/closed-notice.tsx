import type { AttemptStatus } from "@/lib/generated/prisma/enums";
import { LEVEL_LABELS } from "@/lib/grading/rubric";
import type { PublishedGradeView } from "@/lib/grading/student";

/** Replaces the message box once the attempt has ended: the published grade, or what happens next. */
export function ClosedNotice({ status, grade }: { status: AttemptStatus; grade: PublishedGradeView | null }) {
  if (grade) return <GradeCard grade={grade} />;
  return (
    <div data-testid="closed-notice" className="rounded-lg bg-zinc-50 px-3 py-3 text-sm dark:bg-zinc-900">
      <p className="font-medium">
        作答已結束
        <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${status === "COMPLETED" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"}`}>
          {status === "COMPLETED" ? "已完成" : "未完成"}
        </span>
      </p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">已送交評分。老師確認並公佈成績後，你會在這裡和「我的作業」看到結果。</p>
    </div>
  );
}

export function GradeCard({ grade }: { grade: PublishedGradeView }) {
  return (
    <section aria-label="成績" data-testid="grade-card" className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-500/30 dark:bg-indigo-500/10">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">成績已公佈</h3>
        <p className="text-sm">
          <span className="text-2xl font-semibold tabular-nums text-indigo-700 dark:text-indigo-300">{grade.total}</span>
          <span className="text-zinc-500"> / 100</span>
        </p>
      </div>
      <ul className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
        {grade.levels.map((item) => (
          <li key={item.name} className="flex justify-between gap-2 rounded bg-white/70 px-2 py-1 dark:bg-zinc-900/60">
            <span className="text-zinc-600 dark:text-zinc-400">{item.name}</span>
            <span className="font-medium">
              {item.level} {LEVEL_LABELS[item.level]}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{grade.feedback}</p>
    </section>
  );
}
