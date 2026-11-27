import { describe, expect, it } from "vitest";
import { PLATFORM_SAFETY_RULES } from "./guards";
import { buildAssistantSystemPrompt, loadAssistantTemplate } from "./prompts";
import { buildStatusMessage } from "./status";

const problem = {
  statement: "# 從 1 加到 n\n讀入 n，輸出 1 + 2 + … + n。",
  samples: [
    { input: "5\n", expectedOutput: "15\n" },
    { input: "10\n", expectedOutput: "55\n" },
  ],
  variationHint: "只加總偶數",
};

describe("buildAssistantSystemPrompt", () => {
  const prompt = buildAssistantSystemPrompt(problem);

  it("loads the main prompt from prompts/assistant.md", () => {
    expect(loadAssistantTemplate()).toContain("{{題目敘述}}");
  });

  it("fills in the problem and samples and leaves no placeholder", () => {
    expect(prompt).toContain("讀入 n，輸出 1 + 2 + … + n。");
    expect(prompt).toContain("範例 2\n輸入：\n10\n輸出：\n55");
    expect(prompt).toContain("只加總偶數");
    expect(prompt).not.toMatch(/\{\{[^}]+\}\}/);
  });

  it("points volatile values to the status message so the prompt stays cacheable", () => {
    expect(prompt).toContain("見對話最後的「目前狀態」");
  });

  it("ends with the platform safety rules", () => {
    expect(prompt.endsWith(PLATFORM_SAFETY_RULES)).toBe(true);
    expect(prompt.indexOf("# 輸出格式")).toBeLessThan(prompt.indexOf(PLATFORM_SAFETY_RULES));
  });
});

describe("buildStatusMessage", () => {
  const run = {
    kind: "run" as const,
    passed: 1,
    total: 2,
    createdAt: "",
    cases: [
      { name: "s1", verdict: "accepted" as const, input: "5\n", expectedOutput: "15\n", stdout: "15\n", stderr: "", explanation: null, timeSec: 0.01 },
      {
        name: "s2",
        verdict: "runtime_error" as const,
        input: "10\n",
        expectedOutput: "55\n",
        stdout: "",
        stderr: "ZeroDivisionError: division by zero",
        explanation: null,
        timeSec: 0.01,
      },
    ],
  };
  const submit = {
    kind: "submit" as const,
    passed: 5,
    total: 6,
    createdAt: "",
    cases: [1, 2, 3, 4, 5, 6].map((index) => ({ index, verdict: index === 6 ? ("time_limit" as const) : ("accepted" as const) })),
  };

  it("includes the code, sample detail and hidden verdicts only", () => {
    const status = buildStatusMessage({ stage: 3, code: "n = int(input())", languageHints: "縮排", run, submit });
    expect(status).toContain("目前階段：3（組合解題邏輯）");
    expect(status).toContain("n = int(input())");
    expect(status).toContain("範例測資 1/2 通過");
    expect(status).toContain("ZeroDivisionError");
    expect(status).toContain("隱藏測資 5/6 通過");
    expect(status).toContain("第 6 筆超過時間");
    expect(status).toContain("縮排");
  });

  it("says when nothing has run yet", () => {
    const status = buildStatusMessage({ stage: 1, code: "", languageHints: "", run: null, submit: null });
    expect(status).toContain("還沒有寫程式");
    expect(status).toContain("還沒有執行過");
    expect(status).toContain("還沒有提交測試");
  });
});
