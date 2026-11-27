import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({ grade: { create: vi.fn() }, gradeAuditLog: { create: vi.fn() } }));
const db = vi.hoisted(() => ({
  grade: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  gradeAuditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
const grader = vi.hoisted(() => ({ gradeVersion: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: () => db }));
vi.mock("@/lib/ai/grader", () => ({ gradeVersion: grader.gradeVersion, createGraderModel: () => ({}) }));

import { applyReviewAction, parseReviewAction } from "./review";
import { DIMENSION_NAMES, toStoredGrade } from "./rubric";

const TEACHER = "teacher@example.test";
const stored = toStoredGrade({
  dimensions: DIMENSION_NAMES.map((name) => ({ name, level: 3, evidence: ["第 1 輪"], comment: "AI 評語" })),
  feedback_to_student: "AI 回饋",
  confidence: "中",
  flags: [],
});
const levels = (level: number) => Object.fromEntries(DIMENSION_NAMES.map((name) => [name, level]));
const comments = Object.fromEntries(DIMENSION_NAMES.map((name) => [name, "老師評語"]));

function gradeRow(status: string, version = 1) {
  return { id: "g1", attemptId: "a1", version, status, resultJson: stored };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.grade.findUnique.mockResolvedValue(gradeRow("AI_GRADED"));
  db.grade.findFirst.mockResolvedValue({ id: "g1" });
  db.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === "function" ? (arg as (client: typeof tx) => unknown)(tx) : Promise.all(arg as Promise<unknown>[]),
  );
  tx.grade.create.mockResolvedValue({ id: "g2" });
  grader.gradeVersion.mockResolvedValue(stored);
});

describe("parseReviewAction", () => {
  it("accepts well-formed actions only", () => {
    expect(parseReviewAction({ action: "confirm" })).toEqual({ action: "confirm" });
    expect(parseReviewAction({ action: "regrade", note: "  再看第 3 輪 " })).toEqual({ action: "regrade", note: "再看第 3 輪" });
    expect(parseReviewAction({ action: "regrade", note: " " })).toBeNull();
    expect(parseReviewAction({ action: "edit", levels: levels(4), comments, feedback: "好" })).toMatchObject({ action: "edit" });
    expect(parseReviewAction({ action: "edit", levels: { ...levels(4), 題目理解: 5 }, comments, feedback: "好" })).toBeNull();
    expect(parseReviewAction({ action: "delete" })).toBeNull();
    expect(parseReviewAction(null)).toBeNull();
  });
});

describe("applyReviewAction", () => {
  it("follows AI 已評 → 教師已確認 → 已公佈 and logs each step", async () => {
    expect(await applyReviewAction("g1", TEACHER, { action: "publish" })).toEqual({ ok: false, reason: "invalid_state" });
    expect(await applyReviewAction("g1", TEACHER, { action: "confirm" })).toEqual({ ok: true, gradeId: "g1" });
    expect(db.grade.update).toHaveBeenLastCalledWith({ where: { id: "g1" }, data: { status: "TEACHER_CONFIRMED" } });

    db.grade.findUnique.mockResolvedValue(gradeRow("TEACHER_CONFIRMED"));
    expect(await applyReviewAction("g1", TEACHER, { action: "publish" })).toEqual({ ok: true, gradeId: "g1" });
    expect(db.grade.update).toHaveBeenLastCalledWith({ where: { id: "g1" }, data: { status: "PUBLISHED" } });
    expect(db.gradeAuditLog.create.mock.calls.map((call) => call[0].data.action)).toEqual(["confirmed", "published"]);
    expect(db.gradeAuditLog.create.mock.calls.every((call) => call[0].data.actorEmail === TEACHER)).toBe(true);
  });

  it("edits levels, recomputes the total and logs before and after", async () => {
    const outcome = await applyReviewAction("g1", TEACHER, { action: "edit", levels: levels(4), comments, feedback: "老師回饋" });
    expect(outcome.ok).toBe(true);
    const update = db.grade.update.mock.calls[0][0];
    expect(update.data.total).toBe(100);
    expect(update.data.resultJson.feedback_to_student).toBe("老師回饋");
    // Evidence from the AI stays.
    expect(update.data.resultJson.dimensions[0].evidence).toEqual(["第 1 輪"]);
    const audit = db.gradeAuditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe("edited");
    expect(audit.detailJson.before.total).toBe(75);
    expect(audit.detailJson.after.total).toBe(100);
  });

  it("regrades into a new version and keeps the old one", async () => {
    db.grade.findUnique.mockResolvedValue(gradeRow("TEACHER_CONFIRMED", 1));
    const outcome = await applyReviewAction("g1", TEACHER, { action: "regrade", note: "第 3 輪有考慮邊界" });
    expect(outcome).toEqual({ ok: true, gradeId: "g2" });
    expect(tx.grade.create).toHaveBeenCalledWith({ data: { attemptId: "a1", version: 2, status: "PENDING" }, select: { id: true } });
    expect(tx.gradeAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ gradeId: "g1", action: "regrade_requested", detailJson: { note: "第 3 輪有考慮邊界", newVersion: 2 } }),
    });
    expect(grader.gradeVersion).toHaveBeenCalledWith("g2", expect.anything(), "第 3 輪有考慮邊界");
    expect(db.grade.update).not.toHaveBeenCalled();
  });

  it("never changes a published grade or an older version", async () => {
    db.grade.findUnique.mockResolvedValue(gradeRow("PUBLISHED"));
    for (const action of [{ action: "confirm" }, { action: "regrade", note: "x" }, { action: "edit", levels: levels(1), comments, feedback: "" }] as const) {
      expect(await applyReviewAction("g1", TEACHER, action)).toEqual({ ok: false, reason: "invalid_state" });
    }
    db.grade.findUnique.mockResolvedValue(gradeRow("AI_GRADED"));
    db.grade.findFirst.mockResolvedValue({ id: "g2" });
    expect(await applyReviewAction("g1", TEACHER, { action: "confirm" })).toEqual({ ok: false, reason: "not_latest" });
    expect(db.grade.update).not.toHaveBeenCalled();
  });

  it("retries a pending grade", async () => {
    db.grade.findUnique.mockResolvedValue({ ...gradeRow("PENDING"), resultJson: null });
    expect(await applyReviewAction("g1", TEACHER, { action: "retry" })).toEqual({ ok: true, gradeId: "g1" });
    grader.gradeVersion.mockResolvedValueOnce(null);
    expect(await applyReviewAction("g1", TEACHER, { action: "retry" })).toEqual({ ok: false, reason: "grading_failed" });
    expect(await applyReviewAction("g1", TEACHER, { action: "edit", levels: levels(2), comments, feedback: "" })).toEqual({ ok: false, reason: "invalid_state" });
  });
});
