import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { GradePanel } from "@/components/teacher/grade-panel";
import { TeacherHeader } from "@/components/teacher-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatEditSummary } from "@/lib/ai/grader";
import { verdictOf, type StoredCase } from "@/lib/attempts/run";
import { requireTeacher } from "@/lib/auth/teacher";
import { getReviewDetail } from "@/lib/grading/review";

export default function ReviewPage({ params }: PageProps<"/teacher/attempts/[id]">) {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-zinc-500" aria-busy="true">載入中…</div>}>
      <ReviewDetail params={params} />
    </Suspense>
  );
}

const VERDICT_TEXT: Record<string, string> = {
  accepted: "通過",
  wrong_answer: "答案錯誤",
  runtime_error: "執行錯誤",
  compile_error: "編譯錯誤",
  time_limit: "超過時間",
  memory_limit: "超過記憶體",
  internal_error: "系統錯誤",
};

function time(date: Date): string {
  return date.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">{title}</h2>
        {aside}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

async function ReviewDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireTeacher();
  const { id } = await params;
  const detail = await getReviewDetail(id);
  if (!detail) notFound();

  const submits = detail.runs.filter((run) => run.kind === "submit");
  const latestSubmit = submits.at(-1);
  const cases = (latestSubmit?.resultJson as unknown as StoredCase[] | undefined) ?? [];
  const flagged = detail.editEvents.filter((edit) => edit.flagged);
  const codeLines = detail.code.split("\n");
  const turns = detail.messages.reduce<number[]>((list, message) => [...list, (list.at(-1) ?? 0) + (message.role === "STUDENT" ? 1 : 0)], []);
  const current = detail.grades[0];

  return (
    <div className="flex min-h-screen flex-col">
      <TeacherHeader name={user.name ?? user.email} role={user.role} current="review" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <nav aria-label="導覽路徑" className="mb-3 text-sm text-zinc-500">
          <Link href="/teacher" className="hover:text-zinc-900 dark:hover:text-zinc-100">
            審核作答
          </Link>
          <span aria-hidden className="mx-2 text-zinc-300 dark:text-zinc-700">/</span>
          <span aria-current="page" className="text-zinc-800 dark:text-zinc-200">
            {detail.user.name ?? detail.user.email}
          </span>
        </nav>
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">
            {detail.user.name ?? detail.user.email} · {detail.problem.title}
          </h1>
          <StatusBadge status={detail.status} />
          <span className="text-sm text-zinc-500">
            {time(detail.startedAt)} 開始 · {detail.finishedAt ? `${time(detail.finishedAt)} 結束` : "—"}
          </span>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0 space-y-5">
            <Section title="最終程式碼">
              <pre className="overflow-x-auto rounded-lg bg-zinc-950 py-3 font-mono text-[13px] leading-6 text-zinc-100">
                {codeLines.map((line, index) => (
                  <div key={index} className="flex">
                    <span className="w-10 shrink-0 select-none pr-3 text-right text-zinc-500">{index + 1}</span>
                    <span className="whitespace-pre pr-4">{line || " "}</span>
                  </div>
                ))}
              </pre>
            </Section>

            <Section
              title="隱藏測資結果（只有老師看得到內容）"
              aside={latestSubmit && <span className="text-xs tabular-nums text-zinc-500">提交 {submits.length} 次 · 最後一次 {latestSubmit.passedCount}/{latestSubmit.totalCount}</span>}
            >
              {cases.length === 0 ? (
                <p className="text-sm text-zinc-500">學生沒有提交過隱藏測資。</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-zinc-500">
                      <tr>
                        <th scope="col" className="py-1 pr-3 font-medium">#</th>
                        <th scope="col" className="py-1 pr-3 font-medium">判定</th>
                        <th scope="col" className="py-1 pr-3 font-medium">輸入</th>
                        <th scope="col" className="py-1 pr-3 font-medium">預期輸出</th>
                        <th scope="col" className="py-1 font-medium">學生輸出</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 font-mono dark:divide-zinc-800">
                      {cases.map((item, index) => {
                        const verdict = verdictOf(item);
                        return (
                          <tr key={item.name}>
                            <td className="py-1.5 pr-3 font-sans text-zinc-500">{index + 1}</td>
                            <td className={`py-1.5 pr-3 font-sans font-medium ${verdict === "accepted" ? "text-emerald-600" : "text-rose-600"}`}>{VERDICT_TEXT[verdict]}</td>
                            <td className="max-w-40 truncate py-1.5 pr-3">{item.input.trim()}</td>
                            <td className="max-w-40 truncate py-1.5 pr-3">{item.expectedOutput.trim()}</td>
                            <td className="max-w-40 truncate py-1.5">{item.run.stdout.trim() || item.run.stderr.trim().split("\n").at(-1)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            <Section title="編輯歷程" aside={flagged.length > 0 && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">⚑ {flagged.length} 次大段出現</span>}>
              <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                {formatEditSummary({ edits: detail.editEvents, startedAt: detail.startedAt, finishedAt: detail.finishedAt ?? new Date() })}
              </p>
            </Section>

            <Section title="AI 助理對話全文" aside={<span className="text-xs text-zinc-500">{detail.messages.filter((message) => message.role === "STUDENT").length} 輪</span>}>
              {detail.messages.length === 0 ? (
                <p className="text-sm text-zinc-500">學生沒有和 AI 助理對話。</p>
              ) : (
                <ol className="space-y-3">
                  {detail.messages.map((message, index) => {
                    const turn = turns[index];
                    return (
                      <li key={message.id} className={message.role === "STUDENT" ? "flex justify-end" : "flex"}>
                        <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${message.role === "STUDENT" ? "rounded-br-md bg-indigo-600 text-white" : "rounded-tl-md bg-zinc-100 dark:bg-zinc-800"}`}>
                          <p className={`mb-0.5 text-[11px] ${message.role === "STUDENT" ? "text-indigo-200" : "text-zinc-500"}`}>
                            第 {turn} 輪 · {message.role === "STUDENT" ? "學生" : "AI 助理"} · {time(message.createdAt)}
                          </p>
                          {message.role === "STUDENT" ? (
                            <p className="whitespace-pre-wrap break-words">{message.content}</p>
                          ) : (
                            <div className="prose prose-sm prose-zinc max-w-none dark:prose-invert prose-p:my-1 prose-pre:my-2">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Section>
          </div>

          <aside className="lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <GradePanel key={current ? `${current.id}-${current.audit.length}` : "none"} grades={detail.grades} />
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
