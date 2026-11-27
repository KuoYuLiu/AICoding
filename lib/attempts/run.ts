import { getDb } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { getLanguage } from "@/lib/languages";
import { createRunner, runTestCases, type CodeRunner, type RunStatus, type TestCaseResult } from "@/lib/runner";
import { explainRunError, type ErrorExplanation } from "@/lib/runner/explain";
import { MAX_CODE_CHARS } from "./edit-history";

export type RunKind = "run" | "submit";

/** Runs plus submissions per student per minute. */
export const RUNS_PER_MINUTE = 10;

export type Verdict = "accepted" | "wrong_answer" | Exclude<RunStatus, "ok">;

export function verdictOf(result: Pick<TestCaseResult, "passed" | "run">): Verdict {
  if (result.passed) return "accepted";
  return result.run.status === "ok" ? "wrong_answer" : result.run.status;
}

/** Sample-case detail: everything here is already visible in the problem statement. */
export interface SampleCaseView {
  name: string;
  verdict: Verdict;
  input: string;
  expectedOutput: string;
  stdout: string;
  stderr: string;
  explanation: ErrorExplanation | null;
  timeSec: number | null;
}

/** Hidden-case view: verdict only. No input, output or error text, which could reveal the data. */
export interface HiddenCaseView {
  index: number;
  verdict: Verdict;
}

export type RunView =
  | { kind: "run"; passed: number; total: number; createdAt: string; cases: SampleCaseView[] }
  | { kind: "submit"; passed: number; total: number; createdAt: string; cases: HiddenCaseView[] };

interface StoredCase {
  name: string;
  hidden: boolean;
  passed: boolean;
  input: string;
  expectedOutput: string;
  run: TestCaseResult["run"];
}

/** Builds what the student's browser may see from a stored run. */
export function toRunView(kind: RunKind, stored: StoredCase[], languageId: string, createdAt: Date): RunView {
  const language = getLanguage(languageId);
  const passed = stored.filter((item) => item.passed).length;
  const base = { passed, total: stored.length, createdAt: createdAt.toISOString() };
  if (kind === "submit") {
    return { kind, ...base, cases: stored.map((item, index) => ({ index: index + 1, verdict: verdictOf(item) })) };
  }
  return {
    kind,
    ...base,
    cases: stored
      .filter((item) => !item.hidden)
      .map((item) => ({
        name: item.name,
        verdict: verdictOf(item),
        input: item.input,
        expectedOutput: item.expectedOutput,
        stdout: item.run.stdout,
        stderr: item.run.stderr,
        explanation: explainRunError(language, item.run.status, item.run.stderr),
        timeSec: item.run.timeSec,
      })),
  };
}

export type RunOutcome =
  | { ok: true; view: RunView }
  | { ok: false; reason: "not_found" | "closed" | "too_long" }
  | { ok: false; reason: "rate_limited"; retryAfterSec: number };

export async function runAttempt(
  attemptId: string,
  userId: string,
  kind: RunKind,
  code: string,
  runner?: CodeRunner,
  now: Date = new Date(),
): Promise<RunOutcome> {
  if (code.length > MAX_CODE_CHARS) return { ok: false, reason: "too_long" };
  const db = getDb();
  const attempt = await db.attempt.findUnique({
    where: { id: attemptId },
    select: { userId: true, status: true, problem: { select: { languageId: true, id: true } } },
  });
  if (!attempt || attempt.userId !== userId) return { ok: false, reason: "not_found" };
  if (attempt.status !== "IN_PROGRESS") return { ok: false, reason: "closed" };

  const windowStart = new Date(now.getTime() - 60_000);
  const recent = await db.runRecord.findMany({
    where: { attempt: { userId }, createdAt: { gt: windowStart } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
    take: RUNS_PER_MINUTE,
  });
  if (recent.length >= RUNS_PER_MINUTE) {
    const retryAfterSec = Math.max(1, Math.ceil((recent[0].createdAt.getTime() + 60_000 - now.getTime()) / 1000));
    return { ok: false, reason: "rate_limited", retryAfterSec };
  }

  const testCases = await db.testCase.findMany({
    where: { problemId: attempt.problem.id, hidden: kind === "submit" },
    orderBy: { order: "asc" },
    select: { name: true, input: true, expectedOutput: true, hidden: true },
  });
  const language = getLanguage(attempt.problem.languageId);

  // Keep the code that was run, even if autosave has not caught up yet.
  await db.attempt.update({ where: { id: attemptId }, data: { code } });

  const results = await runTestCases(runner ?? createRunner(), language, code, testCases);
  const stored: StoredCase[] = results.map((result, index) => ({
    name: result.name,
    hidden: result.hidden,
    passed: result.passed,
    input: testCases[index].input,
    expectedOutput: testCases[index].expectedOutput,
    run: result.run,
  }));

  const record = await db.runRecord.create({
    data: {
      attemptId,
      kind,
      code,
      passedCount: stored.filter((item) => item.passed).length,
      totalCount: stored.length,
      resultJson: stored as unknown as Prisma.InputJsonValue,
    },
    select: { createdAt: true },
  });
  return { ok: true, view: toRunView(kind, stored, language.id, record.createdAt) };
}

/** The latest run and submission of an attempt, for restoring the result panel on page load. */
export async function latestRunViews(attemptId: string, languageId: string): Promise<{ run: RunView | null; submit: RunView | null }> {
  const db = getDb();
  const load = async (kind: RunKind) => {
    const record = await db.runRecord.findFirst({
      where: { attemptId, kind },
      orderBy: { createdAt: "desc" },
      select: { resultJson: true, createdAt: true },
    });
    return record ? toRunView(kind, record.resultJson as unknown as StoredCase[], languageId, record.createdAt) : null;
  };
  const [run, submit] = await Promise.all([load("run"), load("submit")]);
  return { run, submit };
}
