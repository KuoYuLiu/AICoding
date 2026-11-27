"use client";

import { useEffect, useRef, useState } from "react";

interface FinishDialogProps {
  open: boolean;
  passedAll: boolean;
  attemptId: string;
  onClose: () => void;
  onFinished: () => void;
}

/** Confirms ending the attempt. Ending locks the editor and sends the work to grading. */
export function FinishDialog({ open, passedAll, attemptId, onClose, onFinished }: FinishDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/attempts/${attemptId}/finish`, { method: "POST" });
      if (!response.ok && response.status !== 409) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "送出失敗，請稍後再試。");
        return;
      }
      onFinished();
    } catch {
      setError("連線中斷，請檢查網路後再試一次。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="finish-title"
      aria-describedby="finish-body"
      onClose={onClose}
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-2xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-zinc-950/40 backdrop:backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <div className="p-6">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className={`grid size-10 shrink-0 place-items-center rounded-full text-lg ${
              passedAll ? "bg-emerald-50 dark:bg-emerald-500/15" : "bg-amber-50 dark:bg-amber-500/15"
            }`}
          >
            {passedAll ? "✓" : "!"}
          </span>
          <div>
            <h2 id="finish-title" className="text-base font-semibold">
              {passedAll ? "結束作答並送交評分？" : "測資還沒全部通過，確定要結束嗎？"}
            </h2>
            <div id="finish-body" className="mt-2 space-y-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {passedAll ? (
                <p>結束後就不能再修改程式或和 AI 助理對話。AI 會依五個面向評量你的解題過程，老師確認後才會公佈成績。</p>
              ) : (
                <>
                  <p>現在結束會以「未完成」送交評分，「學習反饋」面向記 1 分，其他面向照常評分。</p>
                  <p>結束後就不能再修改，也不開放重做。</p>
                </>
              )}
            </div>
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-6 py-3 dark:border-zinc-800 dark:bg-zinc-950/40">
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          繼續作答
        </button>
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={busy}
          className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-white shadow-sm transition disabled:opacity-60 ${
            passedAll ? "bg-indigo-600 hover:bg-indigo-500" : "bg-rose-600 hover:bg-rose-500"
          }`}
        >
          {busy && <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
          {passedAll ? "結束並送交" : "仍要結束"}
        </button>
      </div>
    </dialog>
  );
}
