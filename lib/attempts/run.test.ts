import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CodeRunner } from "@/lib/runner";

const db = vi.hoisted(() => ({
  attempt: { findUnique: vi.fn(), update: vi.fn() },
  runRecord: { findMany: vi.fn(), create: vi.fn() },
  testCase: { findMany: vi.fn() },
  chatMessage: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));

import { RUNS_PER_MINUTE, runAttempt, toRunView, verdictOf } from "./run";

const SECRET_INPUT = "SECRET_INPUT_99999";
const SECRET_OUTPUT = "SECRET_OUTPUT_4999950000";

const sampleCases = [
  { name: "sample-01", input: "5\n", expectedOutput: "15\n", hidden: false },
  { name: "sample-02", input: "10\n", expectedOutput: "55\n", hidden: false },
];
const hiddenCases = [
  { name: "secret-01", input: "0\n", expectedOutput: "0\n", hidden: true },
  { name: "secret-02", input: `${SECRET_INPUT}\n`, expectedOutput: `${SECRET_OUTPUT}\n`, hidden: true },
];

/** Echo-sum runner: computes 1..n correctly, but crashes on the secret input and leaks it in stderr. */
const runner: CodeRunner = {
  run: async ({ stdin }) => {
    const n = Number(stdin.trim());
    if (stdin.includes(SECRET_INPUT)) {
      return { status: "runtime_error", stdout: "", stderr: `ValueError: bad value ${SECRET_INPUT}`, timeSec: 0.01, memoryKb: null };
    }
    return { status: "ok", stdout: `${(n * (n + 1)) / 2}\n`, stderr: "", timeSec: 0.01, memoryKb: null };
  },
};

const now = new Date("2026-11-27T08:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  db.attempt.findUnique.mockResolvedValue({ userId: "u1", status: "IN_PROGRESS", stage: 3, problem: { id: "p1", languageId: "python-3" } });
  db.chatMessage.create.mockResolvedValue({ id: "m1", createdAt: now });
  db.$transaction.mockImplementation(async (operations: Promise<unknown>[]) => Promise.all(operations));
  db.attempt.update.mockResolvedValue({});
  db.runRecord.findMany.mockResolvedValue([]);
  db.runRecord.create.mockResolvedValue({ createdAt: now });
  db.testCase.findMany.mockImplementation(async ({ where }: { where: { hidden: boolean } }) => (where.hidden ? hiddenCases : sampleCases));
});

describe("verdictOf", () => {
  it("distinguishes wrong answers from crashes", () => {
    const run = { status: "ok" as const, stdout: "", stderr: "", timeSec: null, memoryKb: null };
    expect(verdictOf({ passed: true, run })).toBe("accepted");
    expect(verdictOf({ passed: false, run })).toBe("wrong_answer");
    expect(verdictOf({ passed: false, run: { ...run, status: "time_limit" } })).toBe("time_limit");
  });
});

describe("runAttempt", () => {
  it("runs samples and returns full detail with explanations", async () => {
    const outcome = await runAttempt("a1", "u1", "run", "print(1)", runner, now);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok || outcome.view.kind !== "run") throw new Error("expected a run view");
    expect(outcome.view).toMatchObject({ passed: 2, total: 2 });
    expect(outcome.view.cases[0]).toMatchObject({ input: "5\n", expectedOutput: "15\n", stdout: "15\n", verdict: "accepted" });
    expect(db.testCase.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { problemId: "p1", hidden: false } }));
    expect(db.attempt.update).toHaveBeenCalledWith({ where: { id: "a1" }, data: { code: "print(1)" } });
  });

  it("submits against hidden cases and never returns their content", async () => {
    const outcome = await runAttempt("a1", "u1", "submit", "print(1)", runner, now);
    if (!outcome.ok) throw new Error("expected success");
    expect(outcome.view).toMatchObject({ kind: "submit", passed: 1, total: 2 });
    expect(outcome.view.cases).toEqual([
      { index: 1, verdict: "accepted" },
      { index: 2, verdict: "runtime_error" },
    ]);
    expect(JSON.stringify(outcome.view)).not.toMatch(/SECRET|secret-0/);

    // The teacher-facing record keeps everything.
    const stored = db.runRecord.create.mock.calls[0][0].data;
    expect(stored).toMatchObject({ kind: "submit", passedCount: 1, totalCount: 2 });
    expect(JSON.stringify(stored.resultJson)).toContain(SECRET_INPUT);
  });

  it("limits runs per minute and says when to retry", async () => {
    db.runRecord.findMany.mockResolvedValue(
      Array.from({ length: RUNS_PER_MINUTE }, (_, i) => ({ createdAt: new Date(now.getTime() - 45_000 + i * 1000) })),
    );
    expect(await runAttempt("a1", "u1", "run", "x", runner, now)).toEqual({ ok: false, reason: "rate_limited", retryAfterSec: 15 });
    expect(db.runRecord.create).not.toHaveBeenCalled();
  });

  it("refuses other students' and finished attempts, and oversized code", async () => {
    db.attempt.findUnique.mockResolvedValueOnce({ userId: "u2", status: "IN_PROGRESS", problem: { id: "p1", languageId: "python-3" } });
    expect(await runAttempt("a1", "u1", "run", "x", runner, now)).toEqual({ ok: false, reason: "not_found" });
    db.attempt.findUnique.mockResolvedValueOnce({ userId: "u1", status: "COMPLETED", problem: { id: "p1", languageId: "python-3" } });
    expect(await runAttempt("a1", "u1", "run", "x", runner, now)).toEqual({ ok: false, reason: "closed" });
    expect(await runAttempt("a1", "u1", "run", "x".repeat(60_000), runner, now)).toEqual({ ok: false, reason: "too_long" });
  });
});

describe("toRunView", () => {
  it("drops hidden cases from a run view even if they were stored", () => {
    const stored = [...sampleCases, ...hiddenCases].map((testCase) => ({
      ...testCase,
      passed: true,
      run: { status: "ok" as const, stdout: testCase.expectedOutput, stderr: "", timeSec: null, memoryKb: null },
    }));
    const view = toRunView("run", stored, "python-3", now);
    expect(JSON.stringify(view)).not.toContain("SECRET");
  });
});

describe("reflection stage", () => {
  const allPass = () => db.testCase.findMany.mockResolvedValueOnce([hiddenCases[0]]);

  it("opens stage 5 with the first reflection question when every hidden test passes", async () => {
    allPass();
    const outcome = await runAttempt("a1", "u1", "submit", "print(1)", runner, now);
    if (!outcome.ok) throw new Error("expected ok");
    expect(outcome.reflection?.content).toContain("第一個問題");
    expect(db.attempt.update).toHaveBeenLastCalledWith({ where: { id: "a1" }, data: { stage: 5 } });
    expect(db.chatMessage.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: "ASSISTANT", stage: 5 }) }));
  });

  it("does not repeat it, and never opens it from samples or a partial pass", async () => {
    db.attempt.findUnique.mockResolvedValueOnce({ userId: "u1", status: "IN_PROGRESS", stage: 5, problem: { id: "p1", languageId: "python-3" } });
    allPass();
    expect(await runAttempt("a1", "u1", "submit", "print(1)", runner, now)).not.toHaveProperty("reflection");
    expect(await runAttempt("a1", "u1", "run", "print(1)", runner, now)).not.toHaveProperty("reflection");
    expect(await runAttempt("a1", "u1", "submit", "print(1)", runner, now)).not.toHaveProperty("reflection");
    expect(db.chatMessage.create).not.toHaveBeenCalled();
  });
});
