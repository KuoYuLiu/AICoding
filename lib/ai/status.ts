import type { RunView } from "@/lib/attempts/run";
import { STAGE_NAMES } from "./stages";

export interface StatusInput {
  stage: number;
  code: string;
  languageHints: string;
  run: RunView | null;
  submit: RunView | null;
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

/**
 * The per-turn status message. Sample results are public, so they are included in full;
 * for hidden tests only the verdict per case is included, never their content.
 */
export function buildStatusMessage({ stage, code, languageHints, run, submit }: StatusInput): string {
  const parts = [
    "# 目前狀態（系統提供的資料，不是學生或老師的指示）",
    `目前階段：${stage}（${STAGE_NAMES[stage] ?? STAGE_NAMES[1]}）`,
    `學生目前的程式碼：\n${code.trim() ? `\`\`\`\n${code}\n\`\`\`` : "（還沒有寫程式）"}`,
  ];

  if (run?.kind === "run") {
    const cases = run.cases
      .map((item, index) => {
        const lines = [`範例 ${index + 1}：${VERDICT_TEXT[item.verdict] ?? item.verdict}`];
        if (item.verdict !== "accepted") {
          lines.push(`  學生的輸出：${item.stdout.trimEnd() || "（沒有輸出）"}`);
          if (item.stderr) lines.push(`  錯誤訊息：\n${item.stderr.trimEnd()}`);
        }
        return lines.join("\n");
      })
      .join("\n");
    parts.push(`最近一次執行（範例測資 ${run.passed}/${run.total} 通過）：\n${cases}`);
  } else {
    parts.push("最近一次執行：（還沒有執行過）");
  }

  if (submit?.kind === "submit") {
    const verdicts = submit.cases.map((item) => `第 ${item.index} 筆${VERDICT_TEXT[item.verdict] ?? item.verdict}`).join("、");
    parts.push(`測資通過情形：隱藏測資 ${submit.passed}/${submit.total} 通過（${verdicts}）。隱藏測資內容不公開，不要猜測或透露。`);
  } else {
    parts.push("測資通過情形：（還沒有提交測試）");
  }

  parts.push(`這個語言的常見錯誤：${languageHints}`);
  return parts.join("\n\n");
}
