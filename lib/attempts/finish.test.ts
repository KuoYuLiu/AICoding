import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({ attempt: { updateMany: vi.fn() }, grade: { create: vi.fn() } }));
const db = vi.hoisted(() => ({
  attempt: { findUnique: vi.fn() },
  runRecord: { findFirst: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));

import { finishAttempt } from "./finish";

beforeEach(() => {
  vi.clearAllMocks();
  db.attempt.findUnique.mockResolvedValue({ userId: "u1", status: "IN_PROGRESS" });
  db.$transaction.mockImplementation(async (run: (client: typeof tx) => unknown) => run(tx));
  tx.attempt.updateMany.mockResolvedValue({ count: 1 });
  tx.grade.create.mockResolvedValue({ id: "g1" });
});

describe("finishAttempt", () => {
  it("is COMPLETED when the latest submission passed everything", async () => {
    db.runRecord.findFirst.mockResolvedValue({ passedCount: 6, totalCount: 6 });
    expect(await finishAttempt("a1", "u1")).toEqual({ ok: true, status: "COMPLETED", gradeId: "g1" });
    expect(tx.attempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "a1", status: "IN_PROGRESS" }, data: expect.objectContaining({ status: "COMPLETED" }) }),
    );
    expect(tx.grade.create).toHaveBeenCalledWith({ data: { attemptId: "a1", version: 1, status: "PENDING" }, select: { id: true } });
  });

  it("is INCOMPLETE without a full pass", async () => {
    db.runRecord.findFirst.mockResolvedValueOnce({ passedCount: 5, totalCount: 6 });
    expect(await finishAttempt("a1", "u1")).toMatchObject({ status: "INCOMPLETE" });
    db.runRecord.findFirst.mockResolvedValueOnce(null);
    expect(await finishAttempt("a1", "u1")).toMatchObject({ status: "INCOMPLETE" });
  });

  it("refuses other students, finished attempts and a second click", async () => {
    expect(await finishAttempt("a1", "u2")).toEqual({ ok: false, reason: "not_found" });
    db.attempt.findUnique.mockResolvedValueOnce({ userId: "u1", status: "COMPLETED" });
    expect(await finishAttempt("a1", "u1")).toEqual({ ok: false, reason: "closed" });
    db.runRecord.findFirst.mockResolvedValue(null);
    tx.attempt.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await finishAttempt("a1", "u1")).toEqual({ ok: false, reason: "closed" });
    expect(tx.grade.create).not.toHaveBeenCalled();
  });
});
