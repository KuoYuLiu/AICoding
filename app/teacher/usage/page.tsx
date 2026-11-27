import { Suspense } from "react";
import { TeacherHeader } from "@/components/teacher-header";
import { requireTeacher } from "@/lib/auth/teacher";
import { getUsageReport, PRICE_PER_MTOK } from "@/lib/grading/usage";

export default function UsagePage() {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-zinc-500" aria-busy="true">載入中…</div>}>
      <UsageReport />
    </Suspense>
  );
}

const percent = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);
const usd = (value: number) => `US$ ${value.toFixed(value < 1 ? 3 : 2)}`;
const tokens = (value: number) => value.toLocaleString("zh-TW");

function Stat({ label, value, hint, testId }: { label: string; value: string; hint?: string; testId?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums" data-testid={testId}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

async function UsageReport() {
  const user = await requireTeacher();
  const { problems, agreement } = await getUsageReport();
  const totals = problems.reduce(
    (sum, row) => ({ started: sum.started + row.started, turns: sum.turns + row.studentTurns, cost: sum.cost + row.costUsd, fallbacks: sum.fallbacks + row.safeFallbacks }),
    { started: 0, turns: 0, cost: 0, fallbacks: 0 },
  );

  return (
    <div className="flex min-h-screen flex-col">
      <TeacherHeader name={user.name ?? user.email} role={user.role} current="usage" />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">用量與一致率</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">試辦期間用來估算成本，並檢查進入階段 1 的兩個關卡：AI 沒有洩題、AI 評分與老師大致一致。</p>
        </div>

        <section aria-labelledby="overview" className="space-y-3">
          <h2 id="overview" className="text-sm font-semibold">總覽</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="作答份數" value={String(totals.started)} />
            <Stat label="每份平均對話輪數" value={totals.started ? (totals.turns / totals.started).toFixed(1) : "—"} />
            <Stat label="估算 AI 成本（上限）" value={usd(totals.cost)} hint={totals.started ? `每份約 ${usd(totals.cost / totals.started)}` : undefined} testId="total-cost" />
            <Stat label="回覆被改用安全回覆" value={`${totals.fallbacks} 次`} hint="AI 重寫後仍太接近解答" />
          </div>
        </section>

        <section aria-labelledby="by-problem" className="space-y-3">
          <h2 id="by-problem" className="text-sm font-semibold">各題用量</h2>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/40">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">題目</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">作答／結束</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">平均輪數</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">助理 tokens（入／出）</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">評分 tokens（入／出）</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">估算成本</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">每份</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 tabular-nums dark:divide-zinc-800">
                {problems.map((row) => (
                  <tr key={row.title} data-testid="usage-row">
                    <td className="px-4 py-3 font-medium">{row.title}</td>
                    <td className="px-4 py-3 text-right">
                      {row.started} / {row.finished}
                    </td>
                    <td className="px-4 py-3 text-right">{row.avgTurns}</td>
                    <td className="px-4 py-3 text-right">
                      {tokens(row.assistantInput)} / {tokens(row.assistantOutput)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {tokens(row.graderInput)} / {tokens(row.graderOutput)}
                    </td>
                    <td className="px-4 py-3 text-right">{usd(row.costUsd)}</td>
                    <td className="px-4 py-3 text-right">{row.started ? usd(row.costPerAttemptUsd) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-500">
            以 Claude Opus 5.5 定價估算：輸入每百萬 tokens US$ {PRICE_PER_MTOK.input}、輸出 US$ {PRICE_PER_MTOK.output}。快取讀取實際只要 US$ 0.20，所以真實成本會更低。
          </p>
        </section>

        <section aria-labelledby="agreement" className="space-y-3">
          <h2 id="agreement" className="text-sm font-semibold">AI 與老師評分一致率</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">比較每份已公佈成績中，AI 給的等級與老師最後公佈的等級。共 {agreement.graded} 份。</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="等級完全一致" value={percent(agreement.exactRate)} testId="exact-rate" />
            <Stat label="相差一級以內" value={percent(agreement.withinOneRate)} />
            <Stat label="總分平均差距" value={agreement.meanTotalDiff === null ? "—" : `${agreement.meanTotalDiff} 分`} />
          </div>
          <div className="grid gap-2 sm:grid-cols-5">
            {agreement.perDimension.map((item) => (
              <div key={item.name} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
                <p className="text-xs text-zinc-500">{item.name}</p>
                <p className="font-semibold tabular-nums">{percent(item.exactRate)}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
