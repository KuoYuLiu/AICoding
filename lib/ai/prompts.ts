import { readFileSync } from "node:fs";
import path from "node:path";
import { composeSystemPrompt } from "./guards";

/** Course name shown to the assistant. Stage 0 has a single course. */
export const COURSE_NAME = process.env.COURSE_NAME || "程式設計";

const STATUS_POINTER = "（見對話最後的「目前狀態」）";

let cachedTemplate: string | null = null;

/** The main prompt: the first ```text block of prompts/assistant.md. */
export function loadAssistantTemplate(): string {
  if (cachedTemplate) return cachedTemplate;
  const markdown = readFileSync(path.join(process.cwd(), "prompts", "assistant.md"), "utf8");
  const match = /## 主 prompt\s+```text\n([\s\S]*?)```/.exec(markdown);
  if (!match) throw new Error("prompts/assistant.md has no main prompt block");
  cachedTemplate = match[1];
  return cachedTemplate;
}

export interface ProblemForPrompt {
  statement: string;
  samples: { input: string; expectedOutput: string }[];
  variationHint: string | null;
}

const OUTPUT_FORMAT = `# 輸出格式
回覆一個 JSON 物件：
- reply：給學生看的回覆，遵守上面所有規則。
- stage：你判斷學生「現在」所在的階段，只能是 1 到 4。學生還沒達到下一階段的條件時維持原階段，一次最多前進一個階段。`;

/**
 * The stable system prompt for one problem. Everything that changes turn by turn
 * (code, run results, stage) goes in the status message instead, so this stays cacheable.
 * Never pass the reference solution, hidden tests or student identity here.
 */
export function buildAssistantSystemPrompt(problem: ProblemForPrompt, template = loadAssistantTemplate()): string {
  const samples = problem.samples
    .map((sample, index) => `範例 ${index + 1}\n輸入：\n${sample.input.trimEnd()}\n輸出：\n${sample.expectedOutput.trimEnd()}`)
    .join("\n\n");
  const values: Record<string, string> = {
    課程名稱: COURSE_NAME,
    題目敘述: problem.statement.trim(),
    範例測資: samples,
    講義檢索結果: "（本課程尚未提供講義）",
    老師補充: "（無）",
    變化題提示: problem.variationHint ?? "（換一個類似的條件）",
    目前階段: STATUS_POINTER,
    學生程式碼: STATUS_POINTER,
    執行結果: STATUS_POINTER,
    測資結果摘要: STATUS_POINTER,
  };
  const filled = template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => values[key.trim()] ?? "");
  return composeSystemPrompt(`${filled.trim()}\n\n${OUTPUT_FORMAT}`);
}
