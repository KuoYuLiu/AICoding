"use client";

import { useState } from "react";

const TABS = [
  { id: "run", label: "執行結果", empty: "按「執行」用範例測資跑你的程式，輸出會顯示在這裡。" },
  { id: "submit", label: "測試結果", empty: "按「提交測試」用隱藏測資檢查程式，這裡會顯示通過幾筆。" },
] as const;

export function OutputPane() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("run");
  const active = TABS.find((item) => item.id === tab) ?? TABS[0];

  return (
    <div className="flex h-full flex-col">
      <div role="tablist" aria-label="結果" className="flex gap-1 border-b border-zinc-200 px-2 dark:border-zinc-800">
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            id={`output-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls="output-panel"
            onClick={() => setTab(item.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              tab === item.id
                ? "border-indigo-500 text-zinc-900 dark:text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div id="output-panel" role="tabpanel" aria-labelledby={`output-tab-${tab}`} className="grid flex-1 place-items-center overflow-auto p-4">
        <p className="max-w-72 text-center text-xs leading-relaxed text-zinc-500">{active.empty}</p>
      </div>
    </div>
  );
}
