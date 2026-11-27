import type { LanguageConfig } from "@/lib/languages";
import type { CodeRunner, TestCase, TestCaseResult } from "./types";

/** Compares outputs the way most judges do: ignore trailing whitespace on each line and trailing blank lines. */
export function outputsMatch(actual: string, expected: string): boolean {
  const normalize = (text: string) =>
    text
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .trimEnd();
  return normalize(actual) === normalize(expected);
}

export async function runTestCases(
  runner: CodeRunner,
  language: LanguageConfig,
  sourceCode: string,
  testCases: TestCase[],
): Promise<TestCaseResult[]> {
  const results: TestCaseResult[] = [];
  for (const testCase of testCases) {
    const run = await runner.run({ language, sourceCode, stdin: testCase.input });
    results.push({
      name: testCase.name,
      hidden: testCase.hidden,
      passed: run.status === "ok" && outputsMatch(run.stdout, testCase.expectedOutput),
      run,
    });
  }
  return results;
}
