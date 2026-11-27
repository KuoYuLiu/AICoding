import Link from "next/link";
import { Suspense } from "react";
import { TeacherHeader } from "@/components/teacher-header";
import { GradeStatusBadge } from "@/components/ui/grade-status-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireTeacher } from "@/lib/auth/teacher";
import { listReviewQueue } from "@/lib/grading/review";

export default function TeacherPage() {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-zinc-500" aria-busy="true">載入中…</div>}>
      <ReviewQueue />
    </Suspense>
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

async function ReviewQueue() {
  const user = await requireTeacher();
  const items = await listReviewQueue();
  const waiting = items.filter((item) => item.gradeStatus === "AI_GRADED" || item.gradeStatus === "PENDING").length;

  return (
    <div className="flex min-h-screen flex-col">
      <TeacherHeader name={user.name ?? user.email} role={user.role} current="review" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">審核作答</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">AI 評分後由你確認，按「公佈」學生才看得到成績。</p>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            待處理 <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{waiting}</span> 份，共 {items.length} 份
          </p>
        </div>

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <p className="font-medium">還沒有學生結束作答</p>
            <p className="mt-1 text-sm text-zinc-500">學生按下「結束作答」後，作答會出現在這裡。</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/40">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">學生</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">題目</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">作答</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">結束時間</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">成績狀態</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">總分</th>
                  <th scope="col" className="px-4 py-2.5 font-medium"><span className="sr-only">動作</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {items.map((item) => (
                  <tr key={item.attemptId} data-testid="queue-row" className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                    <td className="px-4 py-3">
                      <p className="font-medium">{item.studentName}</p>
                      <p className="text-xs text-zinc-500">{item.studentEmail}</p>
                    </td>
                    <td className="px-4 py-3">{item.problemTitle}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={item.attemptStatus} />
                        {item.flaggedEdits > 0 && (
                          <span title="編輯歷程中有大段程式碼瞬間出現" className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                            ⚑ {item.flaggedEdits}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-zinc-600 dark:text-zinc-400">{formatTime(item.finishedAt)}</td>
                    <td className="px-4 py-3">
                      <GradeStatusBadge status={item.gradeStatus} />
                      {item.gradeVersion !== null && item.gradeVersion > 1 && <span className="ml-1.5 text-xs text-zinc-500">第 {item.gradeVersion} 版</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{item.total ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/teacher/attempts/${item.attemptId}`}
                        className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        {item.gradeStatus === "AI_GRADED" || item.gradeStatus === "PENDING" ? "審核" : "查看"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
