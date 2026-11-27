"use client";

import type { HiddenCaseView, RunKind, SampleCaseView, Verdict } from "@/lib/attempts/run";
import type { RunnerState } from "./use-runner";

const TABS: { id: RunKind; label: string; empty: string }[] = [
  { id: "run", label: "執行結果", empty: "按「執行」（Ctrl + Enter）用範例測資跑你的程式，輸出會顯示在這裡。" },
  { id: "submit", label: "測試結果", empty: "按「提交測試」用隱藏測資檢查程式，這裡會顯示通過幾筆。" },
];

const VERDICT: Record<Verdict, { label: string; tone: "ok" | "bad" | "warn" }> = {
  accepted: { label: "通過", tone: "ok" },
  wrong_answer: { label: "答案錯誤", tone: "bad" },
  runtime_error: { label: "執行錯誤", tone: "bad" },
  compile_error: { label: "編譯錯誤", tone: "bad" },
  time_limit: { label: "超過時間", tone: "warn" },
  memory_limit: { label: "超過記憶體", tone: "warn" },
  internal_error: { label: "系統錯誤", tone: "warn" },
};

const TONE = {
  ok: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  bad: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  warn: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
};

interface OutputPaneProps {
  state: RunnerState;
  tab: RunKind;
  onTabChange: (tab: RunKind) => void;
  /** Asks the AI assistant about one failing sample. Hidden tests never offer this. */
  onAskAboutError?: (question: string) => void;
}

export function OutputPane({ state, tab, onTabChange, onAskAboutError }: OutputPaneProps) {
  const active = TABS.find((item) => item.id === tab) ?? TABS[0];
  const view = state[tab];
  const error = state.error?.kind === tab ? state.error.message : null;
  const running = state.running === tab;

  return (
    <div className="flex h-full flex-col">
      <div role="tablist" aria-label="結果" className="flex items-center gap-1 border-b border-zinc-200 px-2 dark:border-zinc-800">
        {TABS.map((item) => {
          const tabView = state[item.id];
          return (
            <button
              key={item.id}
              role="tab"
              id={`output-tab-${item.id}`}
              aria-selected={tab === item.id}
              aria-controls="output-panel"
              onClick={() => onTabChange(item.id)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                tab === item.id
                  ? "border-indigo-500 text-zinc-900 dark:text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              {item.label}
              {tabView && (
                <span
                  className={`rounded px-1 py-px text-[10px] tabular-nums ${tabView.passed === tabView.total ? TONE.ok : TONE.bad}`}
                >
                  {tabView.passed}/{tabView.total}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div id="output-panel" role="tabpanel" aria-labelledby={`output-tab-${tab}`} aria-busy={running} className="min-h-0 flex-1 overflow-auto">
        {running ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-zinc-500" data-testid="run-progress">
            <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-zinc-300 border-t-indigo-500" />
            {tab === "run" ? "正在用範例測資執行…" : "正在用隱藏測資測試…"}
          </div>
        ) : error ? (
          <div role="alert" className="m-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
            {error}
          </div>
        ) : !view ? (
          <div className="grid h-full place-items-center p-4">
            <p className="max-w-72 text-center text-xs leading-relaxed text-zinc-500">{active.empty}</p>
          </div>
        ) : view.kind === "run" ? (
          <RunResult cases={view.cases} passed={view.passed} total={view.total} onAsk={onAskAboutError} />
        ) : (
          <SubmitResult cases={view.cases} passed={view.passed} total={view.total} />
        )}
      </div>
    </div>
  );
}

function Summary({ label, passed, total }: { label: string; passed: number; total: number }) {
  const allPassed = passed === total;
  return (
    <div className="flex items-center gap-2" data-testid="result-summary">
      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${allPassed ? TONE.ok : TONE.bad}`}>{allPassed ? "全部通過" : "未全部通過"}</span>
      <span className="text-sm text-zinc-700 dark:text-zinc-300">
        {label} <span className="font-semibold tabular-nums">{passed}</span> / <span className="tabular-nums">{total}</span> 通過
      </span>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const style = VERDICT[verdict];
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${TONE[style.tone]}`}>{style.label}</span>;
}

function RunResult({
  cases,
  passed,
  total,
  onAsk,
}: {
  cases: SampleCaseView[];
  passed: number;
  total: number;
  onAsk?: (question: string) => void;
}) {
  return (
    <div className="space-y-3 p-3">
      <Summary label="範例測資" passed={passed} total={total} />
      {cases.map((item, index) => (
        <details key={item.name} open={item.verdict !== "accepted" || cases.length === 1} className="group rounded-lg border border-zinc-200 dark:border-zinc-800">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
            <span aria-hidden className="text-zinc-400 transition-transform group-open:rotate-90">
              ›
            </span>
            <span className="font-medium">範例 {index + 1}</span>
            <VerdictBadge verdict={item.verdict} />
            {item.timeSec !== null && <span className="ml-auto text-xs tabular-nums text-zinc-500">{item.timeSec.toFixed(2)} 秒</span>}
          </summary>
          <div className="space-y-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
            {item.explanation && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
                <p className="font-medium text-amber-900 dark:text-amber-200">
                  {item.explanation.title}
                  {item.explanation.line !== null && <span className="ml-1 font-normal">（第 {item.explanation.line} 行）</span>}
                </p>
                <p className="mt-0.5 text-amber-900/80 dark:text-amber-100/80">{item.explanation.detail}</p>
                {onAsk && <AskButton onClick={() => onAsk(errorQuestion(index + 1, item))} />}
              </div>
            )}
            {!item.explanation && item.verdict === "wrong_answer" && onAsk && (
              <AskButton label="請 AI 助理陪我找原因" onClick={() => onAsk(errorQuestion(index + 1, item))} />
            )}
            <div className="grid gap-2 sm:grid-cols-3">
              <IoBlock label="輸入" value={item.input} />
              <IoBlock label="預期輸出" value={item.expectedOutput} />
              <IoBlock label="你的輸出" value={item.stdout} highlight={item.verdict === "wrong_answer"} testId="actual-output" />
            </div>
            {item.stderr && (
              <details className="text-xs">
                <summary className="cursor-pointer text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">原始錯誤訊息</summary>
                <pre className="mt-1 overflow-x-auto rounded-md bg-zinc-950 p-2 font-mono text-[12px] leading-5 text-zinc-100">{item.stderr}</pre>
              </details>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}

/** The question sent for a failing sample. It holds only what the student can already see. */
export function errorQuestion(sample: number, item: SampleCaseView): string {
  if (item.explanation) {
    const where = item.explanation.line !== null ? `第 ${item.explanation.line} 行` : "程式裡";
    return `我的程式在範例 ${sample} 出現「${item.explanation.title}」，位置在${where}。我看不太懂這個錯誤，可以陪我想想看嗎？`;
  }
  return `範例 ${sample} 的輸入是 ${item.input.trim()}，預期輸出 ${item.expectedOutput.trim()}，但我的程式輸出 ${item.stdout.trim() || "（沒有輸出）"}。可以陪我找找看哪裡不對嗎？`;
}

function AskButton({ onClick, label = "請 AI 助理解釋這個錯誤" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-50 dark:border-indigo-500/40 dark:bg-transparent dark:text-indigo-300 dark:hover:bg-indigo-500/10"
    >
      <span aria-hidden>💬</span>
      {label}
    </button>
  );
}

function IoBlock({ label, value, highlight = false, testId }: { label: string; value: string; highlight?: boolean; testId?: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] font-medium text-zinc-500">{label}</p>
      <pre
        data-testid={testId}
        className={`min-h-8 overflow-x-auto rounded-md px-2 py-1.5 font-mono text-[12px] leading-5 ${
          highlight ? "bg-rose-50 text-rose-900 dark:bg-rose-500/10 dark:text-rose-100" : "bg-zinc-50 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
        }`}
      >
        {value.trimEnd() || <span className="text-zinc-400">（沒有輸出）</span>}
      </pre>
    </div>
  );
}

function SubmitResult({ cases, passed, total }: { cases: HiddenCaseView[]; passed: number; total: number }) {
  const allPassed = passed === total;
  return (
    <div className="space-y-3 p-3">
      <Summary label="隱藏測資" passed={passed} total={total} />
      <ul className="flex flex-wrap gap-1.5" aria-label="各筆測資結果">
        {cases.map((item) => (
          <li key={item.index} className="flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-800">
            <span className="text-zinc-500">第 {item.index} 筆</span>
            <VerdictBadge verdict={item.verdict} />
          </li>
        ))}
      </ul>
      <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
        {allPassed
          ? "太棒了，所有隱藏測資都通過了！接下來 AI 助理會陪你回顧這次的解題過程。"
          : "隱藏測資的內容不會公開。想想看有哪些特殊情況還沒考慮到，例如最小值、最大值或 0，再用「執行」自己測試看看。"}
      </p>
    </div>
  );
}
