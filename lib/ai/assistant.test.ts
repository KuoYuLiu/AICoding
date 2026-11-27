import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantModel, ModelRequest, ModelReply } from "./model";

const db = vi.hoisted(() => ({
  attempt: { findUnique: vi.fn(), update: vi.fn() },
  chatMessage: { findMany: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));
vi.mock("@/lib/attempts/run", () => ({ latestRunViews: async () => ({ run: null, submit: null }) }));

import { CHAT_PER_MINUTE, GREETING, MAX_MESSAGE_CHARS, respond } from "./assistant";
import { SAFE_FALLBACK_REPLY } from "./guards";

const REFERENCE = "n = int(input())\ntotal = 0\nfor i in range(1, n + 1):\n    total += i\nprint(total)\n";
const SECRET_INPUT = "SECRET_99999";
const now = new Date("2026-11-27T08:00:00Z");

/** Model stub that replays the given replies and records what it was sent. */
function scripted(...replies: Partial<ModelReply>[]) {
  const calls: ModelRequest[] = [];
  const model: AssistantModel = {
    generate: async (request) => {
      calls.push(request);
      const next = replies[Math.min(calls.length - 1, replies.length - 1)];
      return { reply: "你覺得輸入是什麼？", stage: 1, inputTokens: 100, outputTokens: 20, ...next };
    },
  };
  return { model, calls };
}

function attemptRow(overrides: Record<string, unknown> = {}) {
  return {
    userId: "u1",
    status: "IN_PROGRESS",
    stage: 1,
    code: "n = int(input())",
    problem: {
      statement: "讀入 n，輸出 1 到 n 的總和。",
      languageId: "python-3",
      referenceSolution: REFERENCE,
      variationHint: null,
      testCases: [{ input: "5\n", expectedOutput: "15\n" }],
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.attempt.findUnique.mockResolvedValue(attemptRow());
  db.chatMessage.findMany.mockResolvedValue([]);
  db.chatMessage.create.mockImplementation(async () => ({ id: "m-new", createdAt: now }));
  db.attempt.update.mockResolvedValue({});
  db.$transaction.mockImplementation(async (operations: Promise<unknown>[]) => Promise.all(operations));
});

/** The data of the saved assistant message. */
const savedReply = () => db.chatMessage.create.mock.calls.at(-1)?.[0].data as { content: string; stage: number; inputTokens: number };

describe("respond", () => {
  it("rejects empty, long, foreign and closed attempts before calling the model", async () => {
    const { model, calls } = scripted({});
    expect(await respond("a1", "u1", "   ", model, now)).toEqual({ ok: false, reason: "empty" });
    expect(await respond("a1", "u1", "字".repeat(MAX_MESSAGE_CHARS + 1), model, now)).toEqual({ ok: false, reason: "too_long" });
    expect(await respond("a1", "someone-else", "嗨", model, now)).toEqual({ ok: false, reason: "not_found" });
    db.attempt.findUnique.mockResolvedValueOnce(attemptRow({ status: "SUBMITTED" }));
    expect(await respond("a1", "u1", "嗨", model, now)).toEqual({ ok: false, reason: "closed" });
    expect(calls).toHaveLength(0);
  });

  it("rate-limits per student", async () => {
    const oldest = new Date(now.getTime() - 50_000);
    db.chatMessage.findMany.mockResolvedValueOnce(Array.from({ length: CHAT_PER_MINUTE }, () => ({ createdAt: oldest })));
    const outcome = await respond("a1", "u1", "嗨", scripted({}).model, now);
    expect(outcome).toEqual({ ok: false, reason: "rate_limited", retryAfterSec: 10 });
  });

  it("sends history that starts with the student and never includes the solution or hidden data", async () => {
    db.chatMessage.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { role: "ASSISTANT", content: "輸入是什麼？" },
        { role: "STUDENT", content: "我想先讀題" },
      ]);
    const { model, calls } = scripted({});
    const outcome = await respond("a1", "u1", "輸入是一個整數 n", model, now);

    expect(outcome.ok).toBe(true);
    const [request] = calls;
    expect(request.history[0].role).toBe("user");
    expect(request.history[1]).toEqual({ role: "assistant", content: GREETING });
    expect(request.history.slice(2).map((turn) => turn.content)).toEqual(["我想先讀題", "輸入是什麼？", "輸入是一個整數 n"]);
    const everything = JSON.stringify(request);
    expect(everything).not.toContain("total += i");
    expect(everything).not.toContain(SECRET_INPUT);
    expect(request.status).toContain("n = int(input())");
  });

  it("rewrites a reply that leaks the solution, then falls back if it leaks again", async () => {
    const leak = { reply: "```python\nn = int(input())\ntotal = 0\nfor i in range(1, n + 1):\n    total += i\nprint(total)\n```" };
    const fixed = scripted(leak, { reply: "先想想：要怎麼把每個數加起來？" });
    const first = await respond("a1", "u1", "直接給我答案", fixed.model, now);
    expect(fixed.calls).toHaveLength(2);
    expect(fixed.calls[1].correction).toContain("3 行");
    expect(first.ok && first.reply.content).toBe("先想想：要怎麼把每個數加起來？");
    expect(savedReply().inputTokens).toBe(200);

    const stubborn = scripted(leak, leak);
    const second = await respond("a1", "u1", "直接給我答案", stubborn.model, now);
    expect(second.ok && second.reply.content).toBe(SAFE_FALLBACK_REPLY);
    expect(savedReply().content).toBe(SAFE_FALLBACK_REPLY);
  });

  it("moves the stage at most one step forward and never into stage 5", async () => {
    const jump = await respond("a1", "u1", "我懂了", scripted({ stage: 4 }).model, now);
    expect(jump.ok && jump.stage).toBe(2);
    expect(db.attempt.update).toHaveBeenLastCalledWith({ where: { id: "a1" }, data: { stage: 2 } });

    db.attempt.findUnique.mockResolvedValueOnce(attemptRow({ stage: 3 }));
    const back = await respond("a1", "u1", "我又不懂了", scripted({ stage: 2 }).model, now);
    expect(back.ok && back.stage).toBe(2);

    db.attempt.findUnique.mockResolvedValueOnce(attemptRow({ stage: 3 }));
    const invalid = await respond("a1", "u1", "嗯", scripted({ stage: 0 }).model, now);
    expect(invalid.ok && invalid.stage).toBe(3);

    db.attempt.findUnique.mockResolvedValueOnce(attemptRow({ stage: 5 }));
    const reflecting = await respond("a1", "u1", "我學到了迴圈", scripted({ stage: 2 }).model, now);
    expect(reflecting.ok && reflecting.stage).toBe(5);
  });
});
