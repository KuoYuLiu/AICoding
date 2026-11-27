import type { LanguageConfig } from "@/lib/languages";
import type { RunStatus } from "../types";
import { explainPythonError } from "./python";
import type { ErrorExplanation } from "./types";

export type { ErrorExplanation } from "./types";

const STATUS_EXPLANATIONS: Partial<Record<RunStatus, Omit<ErrorExplanation, "line">>> = {
  time_limit: { title: "執行超過時間限制", detail: "程式跑太久沒有結束。常見原因是迴圈停不下來，或是在等待不存在的輸入。" },
  memory_limit: { title: "記憶體用量超過限制", detail: "程式用了太多記憶體，例如建立了非常大的串列。" },
  internal_error: { title: "系統暫時無法執行", detail: "這不是你的程式的問題。請稍後再試一次，若持續發生請告訴老師。" },
};

/** Beginner-friendly explanation for a failed run, in Traditional Chinese. Null when the run itself succeeded. */
export function explainRunError(language: LanguageConfig, status: RunStatus, stderr: string): ErrorExplanation | null {
  if (status === "ok") return null;
  const byStatus = STATUS_EXPLANATIONS[status];
  if (byStatus) return { ...byStatus, line: null };
  if (language.id.startsWith("python")) return explainPythonError(stderr, language.fileName);
  return { title: "執行時發生錯誤", detail: "看看下方的原始錯誤訊息，它通常會說明原因。", line: null };
}
