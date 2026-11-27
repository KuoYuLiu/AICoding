import { describe, expect, it } from "vitest";
import { getLanguage } from "@/lib/languages";
import { explainRunError } from "./index";

const python = getLanguage("python-3");
const traceback = (body: string) => `Traceback (most recent call last):\n  File "/tmp/main.py", line 3, in <module>\n    x = 1 / 0\n${body}`;

describe("explainRunError", () => {
  it("explains common Python exceptions with the line number", () => {
    expect(explainRunError(python, "runtime_error", traceback("ZeroDivisionError: division by zero"))).toEqual({
      title: "除以零",
      detail: expect.stringContaining("除以 0"),
      line: 3,
    });
    expect(explainRunError(python, "runtime_error", traceback("EOFError: EOF when reading a line"))?.title).toBe("讀不到更多輸入");
  });

  it("handles syntax errors, which have no traceback header", () => {
    const stderr = '  File "/tmp/main.py", line 2\n    for i in range(n)\n                     ^\nSyntaxError: expected \':\'';
    expect(explainRunError(python, "runtime_error", stderr)).toMatchObject({ title: "語法錯誤", line: 2 });
  });

  it("uses the last line in the student's file, not library files", () => {
    const stderr =
      'Traceback (most recent call last):\n  File "/tmp/main.py", line 5, in <module>\n  File "/usr/lib/python3.12/json/__init__.py", line 346, in loads\nValueError: bad';
    expect(explainRunError(python, "runtime_error", stderr)?.line).toBe(5);
  });

  it("falls back for unknown errors and explains limits", () => {
    expect(explainRunError(python, "runtime_error", "Killed")?.title).toBe("執行時發生錯誤");
    expect(explainRunError(python, "time_limit", "")?.title).toBe("執行超過時間限制");
    expect(explainRunError(python, "ok", "")).toBeNull();
  });
});
