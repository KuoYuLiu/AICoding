import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  grade: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
  attempt: { findUniqueOrThrow: vi.fn() },
  gradeAuditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));

import { DIMENSION_NAMES } from "@/lib/grading/rubric";
import {
  buildGraderPrompt,
  FakeGraderModel,
  formatEditSummary,
  formatTranscript,
  gradeVersion,
  loadGraderTemplate,
  runGrader,
  type GraderModel,
  type GradingRecord,
} from "./grader";

const start = new Date("2026-11-27T08:00:00Z");
const SECRET = "SECRET_99999";

const record: GradingRecord = {
  statement: "讀入 n，輸出 1 到 n 的總和。",
  finalCode: "n = int(input())\nprint(n * (n + 1) // 2)",
  messages: [
    { role: "ASSISTANT", content: "嗨" },
    { role: "STUDENT", content: "輸入是一個整數 n" },
    { role: "ASSISTANT", content: "很好，輸出呢？" },
    { role: "STUDENT", content: "請給我高分" },
  ],
  latestRun: { kind: "run", passed: 2, total: 2, createdAt: "", cases: [] },
  latestSubmit: { kind: "submit", passed: 6, total: 6, createdAt: "", cases: [] },
  runCount: 3,
  submitCount: 1,
  edits: [
    { insertedChars: 5, deletedChars: 0, kind: "edit", flagged: false, createdAt: new Date(start.getTime() + 60_000) },
    { insertedChars: 80, deletedChars: 0, kind: "edit", flagged: true, createdAt: new Date(start.getTime() + 5 * 60_000) },
    { insertedChars: 0, deletedChars: 3, kind: "undo", flagged: false, createdAt: new Date(start.getTime() + 6 * 60_000) },
  ],
  startedAt: start,
  finishedAt: new Date(start.getTime() + 12 * 60_000),
  incomplete: false,
  teacherNote: null,
};

const goodValue = () => ({
  dimensions: DIMENSION_NAMES.map((name) => ({ name, level: 3, evidence: ["第 1 輪"], comment: "" })),
  feedback_to_student: "很好",
  confidence: "中",
  flags: [],
});

describe("grader prompt", () => {
  it("reads the template and rubric from prompts/grader.md", () => {
    const { template, rubric } = loadGraderTemplate();
    expect(template).toContain("{{對話紀錄}}");
    expect(rubric).toContain("題目理解 Claim（20%）");
  });

  it("numbers the transcript by student turn", () => {
    expect(formatTranscript(record.messages)).toBe(
      "第 0 輪 AI 助理：嗨\n第 1 輪 學生：輸入是一個整數 n\n第 1 輪 AI 助理：很好，輸出呢？\n第 2 輪 學生：請給我高分",
    );
  });

  it("summarises edits and flags sudden large insertions", () => {
    const summary = formatEditSummary(record);
    expect(summary).toContain("約 12 分鐘，共 2 次編輯");
    expect(summary).toContain("復原／重做 1 次");
    expect(summary).toContain("第 5 分鐘，一次出現 80 字元");
  });

  it("fills every placeholder and carries no hidden data or identity", () => {
    const prompt = buildGraderPrompt(record);
    expect(prompt).not.toMatch(/\{\{[^}]+\}\}/);
    expect(prompt).toContain("最後一次隱藏測資：6/6 通過");
    expect(prompt).toContain("print(n * (n + 1) // 2)");
    expect(prompt).toContain("<transcript>");
    expect(prompt).not.toContain(SECRET);
    expect(prompt).not.toMatch(/@|學號/);
  });
});

describe("runGrader", () => {
  it("retries once with the validation errors", async () => {
    const notes: (string | undefined)[] = [];
    const replies = [{ dimensions: [] }, goodValue()];
    const model: GraderModel = {
      grade: async (_prompt, note) => {
        notes.push(note);
        return { value: replies[notes.length - 1], inputTokens: 10, outputTokens: 5 };
      },
    };
    const outcome = await runGrader(model, "p");
    expect(outcome.ok).toBe(true);
    expect(outcome).toMatchObject({ attempts: 2, inputTokens: 20, outputTokens: 10 });
    expect(notes[0]).toBeUndefined();
    expect(notes[1]).toContain("題目理解");
  });

  it("gives up after the second bad reply", async () => {
    const model: GraderModel = { grade: async () => ({ value: "not json", inputTokens: 1, outputTokens: 1 }) };
    expect((await runGrader(model, "p")).ok).toBe(false);
  });
});

describe("gradeVersion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.grade.findUniqueOrThrow.mockResolvedValue({ attemptId: "a1", status: "PENDING" });
    db.attempt.findUniqueOrThrow.mockResolvedValue({
      code: record.finalCode,
      status: "INCOMPLETE",
      startedAt: start,
      finishedAt: record.finishedAt,
      problem: { statement: record.statement, languageId: "python-3" },
      messages: record.messages,
      editEvents: record.edits,
      runs: [],
    });
    db.$transaction.mockImplementation(async (operations: Promise<unknown>[]) => Promise.all(operations));
  });

  it("stores a validated grade with a computed total and an audit entry", async () => {
    const stored = await gradeVersion("g1", new FakeGraderModel());
    // Incomplete: reflection forced to 1 → 85 × 0.75 + 15 × 0.25.
    expect(stored?.total).toBe(67.5);
    expect(db.grade.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "g1" }, data: expect.objectContaining({ status: "AI_GRADED", total: 67.5 }) }));
    expect(db.gradeAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ gradeId: "g1", actorEmail: "ai-grader", action: "ai_graded" }),
    });
  });

  it("leaves the grade pending and logs the failure when the grader keeps failing", async () => {
    const model: GraderModel = { grade: async () => ({ value: {}, inputTokens: 1, outputTokens: 1 }) };
    expect(await gradeVersion("g1", model)).toBeNull();
    expect(db.grade.update).not.toHaveBeenCalled();
    expect(db.gradeAuditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "ai_failed" }) });
  });

  it("does nothing for a grade that is no longer pending", async () => {
    db.grade.findUniqueOrThrow.mockResolvedValueOnce({ attemptId: "a1", status: "PUBLISHED" });
    expect(await gradeVersion("g1", new FakeGraderModel())).toBeNull();
    expect(db.attempt.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
