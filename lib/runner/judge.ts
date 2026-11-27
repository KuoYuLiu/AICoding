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

/** Runs every test case (a few at a time) and returns results in test-case order. */
export async function runTestCases(
  runner: CodeRunner,
  language: LanguageConfig,
  sourceCode: string,
  testCases: TestCase[],
  concurrency = 3,
): Promise<TestCaseResult[]> {
  const results: TestCaseResult[] = new Array(testCases.length);
  let next = 0;
  const worker = async () => {
    while (next < testCases.length) {
      const index = next++;
      const testCase = testCases[index];
      const run = await runner.run({ language, sourceCode, stdin: testCase.input });
      results[index] = {
        name: testCase.name,
        hidden: testCase.hidden,
        passed: run.status === "ok" && outputsMatch(run.stdout, testCase.expectedOutput),
        run,
      };
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, testCases.length)) }, worker));
  return results;
}
