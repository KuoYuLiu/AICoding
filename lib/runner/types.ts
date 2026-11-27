import type { LanguageConfig } from "@/lib/languages";

export interface RunRequest {
  language: LanguageConfig;
  sourceCode: string;
  stdin: string;
}

export type RunStatus =
  | "ok"
  | "compile_error"
  | "runtime_error"
  | "time_limit"
  | "memory_limit"
  | "internal_error";

export interface RunResult {
  status: RunStatus;
  stdout: string;
  stderr: string;
  timeSec: number | null;
  memoryKb: number | null;
}

export interface TestCase {
  name: string;
  input: string;
  expectedOutput: string;
  hidden: boolean;
}

export interface TestCaseResult {
  name: string;
  hidden: boolean;
  passed: boolean;
  run: RunResult;
}

/** Every code execution goes through this interface. Student code never runs on our own servers. */
export interface CodeRunner {
  run(request: RunRequest): Promise<RunResult>;
}
