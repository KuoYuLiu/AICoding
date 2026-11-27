import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PublicProblem } from "@/lib/problems/public";

interface ProblemPaneProps {
  problem: PublicProblem;
  languageName: string;
  limits: { timeSec: number; memoryMb: number };
}

export function ProblemPane({ problem, languageName, limits }: ProblemPaneProps) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="px-5 py-5">
        <h1 className="text-xl font-semibold tracking-tight">{problem.title}</h1>
        <dl className="mt-3 flex flex-wrap gap-2 text-xs">
          <Meta label="語言" value={languageName} />
          <Meta label="時間限制" value={`${limits.timeSec} 秒`} />
          <Meta label="記憶體限制" value={`${limits.memoryMb} MB`} />
        </dl>

        <article className="prose prose-sm prose-zinc mt-5 max-w-none dark:prose-invert prose-headings:font-semibold prose-h2:mt-6 prose-h2:mb-2 prose-h2:text-base">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{problem.statement}</ReactMarkdown>
        </article>

        {problem.samples.length > 0 && (
          <section className="mt-6" aria-labelledby="samples-heading">
            <h2 id="samples-heading" className="text-base font-semibold">
              範例
            </h2>
            <div className="mt-3 grid gap-3">
              {problem.samples.map((sample, index) => (
                <div key={sample.name} className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                    範例 {index + 1}
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-zinc-200 dark:divide-zinc-800">
                    <SampleBlock label="輸入" value={sample.input} />
                    <SampleBlock label="輸出" value={sample.expectedOutput} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="font-medium text-zinc-800 dark:text-zinc-200">{value}</dd>
    </div>
  );
}

function SampleBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 p-3">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <pre className="overflow-x-auto font-mono text-[13px] leading-5 text-zinc-800 dark:text-zinc-200">{value.trimEnd()}</pre>
    </div>
  );
}
