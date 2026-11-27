import { describe, expect, it } from "vitest";
import { getLanguage } from "@/lib/languages";
import { outputsMatch, runTestCases } from "./judge";
import { mapJudge0Status } from "./judge0";
import type { CodeRunner, RunRequest, RunResult } from "./types";

describe("outputsMatch", () => {
  it("ignores trailing spaces and trailing blank lines", () => {
    expect(outputsMatch("15  \n\n", "15")).toBe(true);
    expect(outputsMatch("1\r\n2\r\n", "1\n2")).toBe(true);
  });

  it("detects different output", () => {
    expect(outputsMatch("14", "15")).toBe(false);
    expect(outputsMatch(" 15", "15")).toBe(false);
  });
});

describe("mapJudge0Status", () => {
  it("maps Judge0 statuses", () => {
    expect(mapJudge0Status(3)).toBe("ok");
    expect(mapJudge0Status(5)).toBe("time_limit");
    expect(mapJudge0Status(6)).toBe("compile_error");
    expect(mapJudge0Status(11)).toBe("runtime_error");
    expect(mapJudge0Status(13)).toBe("internal_error");
  });
});

describe("runTestCases", () => {
  // Fake runner that "executes" by summing 1..n from stdin, standing in for Judge0 in tests.
  const fakeRunner: CodeRunner = {
    async run({ stdin }: RunRequest): Promise<RunResult> {
      const n = Number(stdin.trim());
      return { status: "ok", stdout: `${(n * (n + 1)) / 2}\n`, stderr: "", timeSec: 0.01, memoryKb: 1000 };
    },
  };

  it("marks each test case as passed or failed", async () => {
    const results = await runTestCases(fakeRunner, getLanguage("python-3"), "print(...)", [
      { name: "sample-1", input: "5\n", expectedOutput: "15\n", hidden: false },
      { name: "secret-1", input: "10\n", expectedOutput: "56\n", hidden: true },
    ]);
    expect(results.map((r) => r.passed)).toEqual([true, false]);
    expect(results.at(1)?.hidden).toBe(true);
  });
});
