import { describe, expect, it } from "vitest";
import {
  CORRECTIONS,
  checkReply,
  composeSystemPrompt,
  exceedsCodeLimit,
  longestCodeBlockLines,
  PLATFORM_SAFETY_RULES,
  resemblesSolution,
} from "./guards";

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

describe("reply check", () => {
  const reference = "n = int(input())\ntotal = 0\nfor i in range(1, n + 1):\n    total += i\nprint(total)\n";

  it("flags a reply that spells out most of the solution, even outside a code block", () => {
    const leak = "你可以這樣寫：total = 0，然後 for i in range(1, n + 1): 裡面 total += i，最後 print(total)";
    expect(resemblesSolution(leak, reference)).toBe(true);
    expect(checkReply(leak, reference)).toBe("resembles_solution");
  });

  it("allows quoting lines the student already wrote", () => {
    const studentCode = "n = int(input())\ntotal = 0\nfor i in range(1, n + 1):\n    total += i\nprint(total)";
    const reply = "你寫的 `for i in range(1, n + 1):` 和 `total += i` 很好，跑跑看結果對嗎？";
    expect(resemblesSolution(reply, reference, studentCode)).toBe(false);
  });

  it("allows a short hint that touches one line", () => {
    expect(checkReply("要讀入整數，可以想想 `int(input())` 做了什麼？", reference)).toBeNull();
  });

  it("checks the code limit first", () => {
    expect(checkReply("```python\na = 1\nb = 2\nc = 3\nd = 4\n```", reference)).toBe("too_much_code");
  });

  it("has a correction for each problem", () => {
    expect(Object.keys(CORRECTIONS).sort()).toEqual(["resembles_solution", "too_much_code"]);
  });
});
