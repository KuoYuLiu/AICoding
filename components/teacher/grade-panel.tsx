"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GradeStatusBadge } from "@/components/ui/grade-status-badge";
import { computeTotal, DIMENSIONS, LEVEL_LABELS } from "@/lib/grading/rubric";
import type { GradeVersionView, ReviewAction } from "@/lib/grading/review";

const ACTION_LABELS: Record<string, string> = {
  ai_graded: "AI 評分完成",
  ai_failed: "AI 評分失敗",
  edited: "修改評分",
  regrade_requested: "請 AI 重改",
  confirmed: "確認評分",
  published: "公佈成績",
};

function time(iso: string): string {
  return new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function GradePanel({ grades }: { grades: GradeVersionView[] }) {
  const router = useRouter();
  const current = grades[0];
  const result = current?.result ?? null;
  const editable = current?.status === "AI_GRADED" || current?.status === "TEACHER_CONFIRMED";

  const initialLevels = Object.fromEntries((result?.dimensions ?? []).map((item) => [item.name, item.level]));
  const initialComments = Object.fromEntries((result?.dimensions ?? []).map((item) => [item.name, item.comment]));
  const [levels, setLevels] = useState<Record<string, number>>(initialLevels);
  const [comments, setComments] = useState<Record<string, string>>(initialComments);
  const [feedback, setFeedback] = useState(result?.feedback_to_student ?? "");
  const [regradeOpen, setRegradeOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<ReviewAction["action"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    result !== null &&
    (feedback !== result.feedback_to_student ||
      result.dimensions.some((item) => levels[item.name] !== item.level || comments[item.name] !== item.comment));
  const total = result ? computeTotal(DIMENSIONS.map((dimension) => ({ name: dimension.name, level: levels[dimension.name] ?? 0 }))) : null;

  async function act(action: ReviewAction) {
    if (!current) return;
    setBusy(action.action);
    setError(null);
    try {
      const response = await fetch(`/api/teacher/grades/${current.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "操作失敗，請稍後再試。");
        return;
      }
      setRegradeOpen(false);
      setNote("");
      router.refresh();
    } catch {
      setError("連線中斷，請檢查網路後再試一次。");
    } finally {
      setBusy(null);
    }
  }

  if (!current) {
    return <p className="text-sm text-zinc-500">這份作答還沒有成績紀錄。</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">評分</h2>
            <GradeStatusBadge status={current.status} />
            <span className="text-xs text-zinc-500">第 {current.version} 版</span>
          </div>
          {result && (
            <p className="mt-1 text-xs text-zinc-500">
              AI 信心：<span className="font-medium text-zinc-700 dark:text-zinc-300">{result.confidence}</span>
            </p>
          )}
        </div>
        {total !== null && (
          <p className="text-right" data-testid="grade-total">
            <span className="text-3xl font-semibold tabular-nums">{total}</span>
            <span className="text-sm text-zinc-500"> / 100</span>
          </p>
        )}
      </div>

      {current.status === "PENDING" && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p>AI 還沒有完成評分。{current.audit.some((entry) => entry.action === "ai_failed") ? "上一次評分失敗了。" : "通常一分鐘內完成，請稍後重新整理。"}</p>
          <button
            type="button"
            onClick={() => void act({ action: "retry" })}
            disabled={busy !== null}
            className="mt-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {busy === "retry" ? "評分中…" : "重新執行 AI 評分"}
          </button>
        </div>
      )}

      {result?.flags && result.flags.length > 0 && (
        <div role="note" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          <p className="font-medium">AI 提醒</p>
          <ul className="mt-1 list-disc pl-5">
            {result.flags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        </div>
      )}

      {result && (
        <ol className="space-y-3">
          {DIMENSIONS.map((dimension) => {
            const item = result.dimensions.find((entry) => entry.name === dimension.name);
            const level = levels[dimension.name];
            return (
              <li key={dimension.name} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800" data-testid="dimension">
                <fieldset disabled={!editable || busy !== null}>
                  <legend className="flex w-full items-center justify-between text-sm font-medium">
                    <span>
                      {dimension.name} <span className="font-normal text-zinc-500">（{dimension.weight}%）</span>
                    </span>
                  </legend>
                  <div className="mt-2 grid grid-cols-4 gap-1" role="radiogroup" aria-label={`${dimension.name}等級`}>
                    {[1, 2, 3, 4].map((value) => (
                      <label
                        key={value}
                        className={`cursor-pointer rounded-md border px-1 py-1.5 text-center text-xs transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 ${
                          level === value
                            ? "border-indigo-500 bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                            : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`level-${dimension.name}`}
                          value={value}
                          checked={level === value}
                          onChange={() => setLevels((current) => ({ ...current, [dimension.name]: value }))}
                          className="sr-only"
                        />
                        {value} {LEVEL_LABELS[value]}
                      </label>
                    ))}
                  </div>
                  {item && item.evidence.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {item.evidence.map((line) => (
                        <li key={line} className="border-l-2 border-zinc-300 pl-2 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                          {line}
                        </li>
                      ))}
                    </ul>
                  )}
                  <label className="mt-2 block">
                    <span className="sr-only">{dimension.name}評語</span>
                    <textarea
                      value={comments[dimension.name] ?? ""}
                      onChange={(event) => setComments((current) => ({ ...current, [dimension.name]: event.target.value }))}
                      rows={2}
                      className="w-full resize-y rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs leading-relaxed outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:disabled:bg-zinc-950"
                    />
                  </label>
                </fieldset>
              </li>
            );
          })}
        </ol>
      )}

      {result && (
        <label className="block">
          <span className="text-sm font-medium">給學生的回饋</span>
          <span className="ml-2 text-xs text-zinc-500">公佈後學生會看到</span>
          <textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            disabled={!editable || busy !== null}
            rows={3}
            className="mt-1 w-full resize-y rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-sm leading-relaxed outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:disabled:bg-zinc-950"
          />
        </label>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      )}

      {editable && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {dirty ? (
              <>
                <button
                  type="button"
                  onClick={() => void act({ action: "edit", levels, comments, feedback })}
                  disabled={busy !== null}
                  className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
                >
                  {busy === "edit" ? "儲存中…" : "儲存修改"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLevels(initialLevels);
                    setComments(initialComments);
                    setFeedback(result?.feedback_to_student ?? "");
                  }}
                  className="rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  放棄修改
                </button>
              </>
            ) : current.status === "AI_GRADED" ? (
              <button
                type="button"
                onClick={() => void act({ action: "confirm" })}
                disabled={busy !== null}
                className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
              >
                {busy === "confirm" ? "處理中…" : "確認評分"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void act({ action: "publish" })}
                disabled={busy !== null}
                className="rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
              >
                {busy === "publish" ? "公佈中…" : "公佈成績給學生"}
              </button>
            )}
            {!dirty && (
              <button
                type="button"
                onClick={() => setRegradeOpen((open) => !open)}
                aria-expanded={regradeOpen}
                className="rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                請 AI 重改
              </button>
            )}
          </div>
          {regradeOpen && (
            <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <label className="block text-sm">
                <span className="font-medium">重改意見</span>
                <span className="ml-2 text-xs text-zinc-500">AI 會依你的意見產生新版本，舊版本保留</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  placeholder="例如：學生在第 3 輪已主動考慮 n = 0，題目理解應再評估。"
                  className="mt-1 w-full resize-y rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>
              <button
                type="button"
                onClick={() => void act({ action: "regrade", note })}
                disabled={busy !== null || !note.trim()}
                className="mt-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {busy === "regrade" ? "AI 重改中，約需一分鐘…" : "送出重改"}
              </button>
            </div>
          )}
          <p className="text-xs text-zinc-500">流程：AI 已評 → 確認評分 → 公佈。公佈後學生才看得到，且不能再修改。</p>
        </div>
      )}

      <section aria-label="版本與紀錄" className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <h3 className="text-sm font-medium">版本與稽核紀錄</h3>
        <ol className="mt-2 space-y-3">
          {grades.map((grade) => (
            <li key={grade.id} className="text-xs" data-testid="grade-version">
              <p className="flex items-center gap-2 font-medium">
                第 {grade.version} 版 <GradeStatusBadge status={grade.status} />
                {grade.result && <span className="tabular-nums text-zinc-500">{grade.result.total} 分</span>}
              </p>
              <ul className="mt-1 space-y-0.5 border-l border-zinc-200 pl-3 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                {grade.audit.map((entry, index) => (
                  <li key={`${entry.at}-${index}`}>
                    <span className="tabular-nums">{time(entry.at)}</span> · {ACTION_LABELS[entry.action] ?? entry.action} · {entry.actor === "ai-grader" ? "AI" : entry.actor}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
