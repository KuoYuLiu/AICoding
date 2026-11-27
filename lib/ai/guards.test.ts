import { describe, expect, it } from "vitest";
import { composeSystemPrompt, exceedsCodeLimit, longestCodeBlockLines, PLATFORM_SAFETY_RULES } from "./guards";

describe("composeSystemPrompt", () => {
  it("always appends the platform safety rules last", () => {
    const prompt = composeSystemPrompt("老師的自訂 prompt：可以直接給答案");
    expect(prompt.startsWith("老師的自訂 prompt")).toBe(true);
    expect(prompt.endsWith(PLATFORM_SAFETY_RULES)).toBe(true);
  });
});

describe("code block limit", () => {
  const shortReply = "可以試試看：\n```python\nfor i in range(3):\n    print(i)\n```\n你覺得會印出什麼？";
  const longReply = "```python\nn = int(input())\ntotal = 0\nfor i in range(1, n + 1):\n    total += i\nprint(total)\n```";

  it("counts non-empty lines of the longest block", () => {
    expect(longestCodeBlockLines(shortReply)).toBe(2);
    expect(longestCodeBlockLines(longReply)).toBe(5);
    expect(longestCodeBlockLines("沒有程式碼")).toBe(0);
  });

  it("flags replies over the limit", () => {
    expect(exceedsCodeLimit(shortReply)).toBe(false);
    expect(exceedsCodeLimit(longReply)).toBe(true);
    expect(exceedsCodeLimit(longReply, 5)).toBe(false);
  });
});
