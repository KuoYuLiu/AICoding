import { STAGES } from "./stages";

export function AssistantPane({ stage }: { stage: number }) {
  const current = STAGES.find((item) => item.id === stage) ?? STAGES[0];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">AI 助理</h2>
          <span className="text-xs text-zinc-500">
            階段 {current.id} / {STAGES.length}
          </span>
        </div>
        <ol className="mt-3 flex gap-1" aria-label="解題階段">
          {STAGES.map((item) => (
            <li key={item.id} className="flex-1" title={`${item.id}. ${item.name}`}>
              <span
                className={`block h-1.5 rounded-full ${
                  item.id < current.id
                    ? "bg-indigo-500"
                    : item.id === current.id
                      ? "bg-indigo-300 dark:bg-indigo-400/60"
                      : "bg-zinc-200 dark:bg-zinc-800"
                }`}
              />
              <span className="sr-only">
                {item.name}
                {item.id === current.id ? "（目前階段）" : ""}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
          <span className="font-medium text-zinc-800 dark:text-zinc-200">{current.name}</span>：{current.hint}
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <span aria-hidden className="grid size-11 place-items-center rounded-full bg-indigo-50 text-lg dark:bg-indigo-500/15">
          💬
        </span>
        <p className="text-sm font-medium">AI 助理即將上線</p>
        <p className="max-w-64 text-xs leading-relaxed text-zinc-500">
          AI 助理不會直接給你答案，而是用提問陪你一步步想出解法。在這之前，先試著自己讀題、寫寫看。
        </p>
      </div>

      <form className="border-t border-zinc-200 p-3 dark:border-zinc-800">
        <label htmlFor="assistant-input" className="sr-only">
          輸入訊息
        </label>
        <div className="flex gap-2">
          <input
            id="assistant-input"
            disabled
            placeholder="下一版開放與 AI 助理對話"
            className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm placeholder:text-zinc-400 disabled:cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900"
          />
          <button
            type="button"
            disabled
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            送出
          </button>
        </div>
      </form>
    </div>
  );
}
