import { gradeVersion, type GraderModel, createGraderModel } from "@/lib/ai/grader";
import { getDb } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { AttemptStatus, GradeStatus } from "@/lib/generated/prisma/enums";
import { DIMENSION_NAMES, LEVEL_LABELS, toStoredGrade, validateGradeResult, type StoredGrade } from "./rubric";

// ---------------------------------------------------------------- queue

export interface QueueItem {
  attemptId: string;
  studentName: string;
  studentEmail: string;
  problemTitle: string;
  attemptStatus: AttemptStatus;
  finishedAt: string | null;
  gradeStatus: GradeStatus | null;
  gradeVersion: number | null;
  total: number | null;
  flaggedEdits: number;
}

const QUEUE_ORDER: Record<string, number> = { AI_GRADED: 0, PENDING: 1, TEACHER_CONFIRMED: 2, PUBLISHED: 3, none: 4 };

/** Finished attempts with their latest grade version, the ones needing the teacher first. */
export async function listReviewQueue(): Promise<QueueItem[]> {
  const attempts = await getDb().attempt.findMany({
    where: { status: { not: "IN_PROGRESS" } },
    orderBy: { finishedAt: "desc" },
    select: {
      id: true,
      status: true,
      finishedAt: true,
      user: { select: { name: true, email: true } },
      problem: { select: { title: true } },
      grades: { orderBy: { version: "desc" }, take: 1, select: { status: true, version: true, total: true } },
      _count: { select: { editEvents: { where: { flagged: true } } } },
    },
  });
  const items = attempts.map((attempt) => {
    const grade = attempt.grades[0];
    return {
      attemptId: attempt.id,
      studentName: attempt.user.name ?? attempt.user.email,
      studentEmail: attempt.user.email,
      problemTitle: attempt.problem.title,
      attemptStatus: attempt.status,
      finishedAt: attempt.finishedAt?.toISOString() ?? null,
      gradeStatus: grade?.status ?? null,
      gradeVersion: grade?.version ?? null,
      total: grade?.total ?? null,
      flaggedEdits: attempt._count.editEvents,
    };
  });
  return items.sort((a, b) => QUEUE_ORDER[a.gradeStatus ?? "none"] - QUEUE_ORDER[b.gradeStatus ?? "none"]);
}

// ---------------------------------------------------------------- actions

export type ReviewAction =
  | { action: "edit"; levels: Record<string, number>; comments: Record<string, string>; feedback: string }
  | { action: "regrade"; note: string }
  | { action: "retry" }
  | { action: "confirm" }
  | { action: "publish" };

export type ReviewOutcome = { ok: true; gradeId: string } | { ok: false; reason: "not_found" | "not_latest" | "invalid_state" | "invalid_input" | "grading_failed" };

/** Parses a request body into an action, or null. */
export function parseReviewAction(body: unknown): ReviewAction | null {
  if (typeof body !== "object" || body === null) return null;
  const raw = body as Record<string, unknown>;
  switch (raw.action) {
    case "edit": {
      const levels = raw.levels as Record<string, unknown> | undefined;
      const comments = raw.comments as Record<string, unknown> | undefined;
      if (!levels || !comments || typeof raw.feedback !== "string") return null;
      const cleanLevels: Record<string, number> = {};
      const cleanComments: Record<string, string> = {};
      for (const name of DIMENSION_NAMES) {
        const level = levels[name];
        const comment = comments[name];
        if (!Number.isInteger(level) || (level as number) < 1 || (level as number) > 4 || typeof comment !== "string") return null;
        cleanLevels[name] = level as number;
        cleanComments[name] = comment.slice(0, 2000);
      }
      return { action: "edit", levels: cleanLevels, comments: cleanComments, feedback: raw.feedback.slice(0, 2000) };
    }
    case "regrade":
      return typeof raw.note === "string" && raw.note.trim() ? { action: "regrade", note: raw.note.trim().slice(0, 2000) } : null;
    case "retry":
    case "confirm":
    case "publish":
      return { action: raw.action };
    default:
      return null;
  }
}

function summary(stored: StoredGrade) {
  return { total: stored.total, levels: Object.fromEntries(stored.dimensions.map((item) => [item.name, item.level])), feedback: stored.feedback_to_student };
}

/**
 * Applies one teacher action to a grade. Only the latest version can change, and a published grade
 * is final. Every change appends to GradeAuditLog; a regrade creates a new version and keeps the old one.
 */
export async function applyReviewAction(
  gradeId: string,
  teacherEmail: string,
  input: ReviewAction,
  model: GraderModel = createGraderModel(),
): Promise<ReviewOutcome> {
  const db = getDb();
  const grade = await db.grade.findUnique({
    where: { id: gradeId },
    select: { id: true, attemptId: true, version: true, status: true, resultJson: true },
  });
  if (!grade) return { ok: false, reason: "not_found" };
  const latest = await db.grade.findFirst({ where: { attemptId: grade.attemptId }, orderBy: { version: "desc" }, select: { id: true } });
  if (latest?.id !== grade.id) return { ok: false, reason: "not_latest" };
  if (grade.status === "PUBLISHED") return { ok: false, reason: "invalid_state" };
  const stored = grade.resultJson as unknown as StoredGrade | null;
  const log = (action: string, detail: Prisma.InputJsonValue, id = gradeId) =>
    db.gradeAuditLog.create({ data: { gradeId: id, actorEmail: teacherEmail, action, detailJson: detail } });

  switch (input.action) {
    case "edit": {
      if (!stored || grade.status === "PENDING") return { ok: false, reason: "invalid_state" };
      const checked = validateGradeResult({
        ...stored,
        dimensions: stored.dimensions.map((item) => ({ ...item, level: input.levels[item.name], comment: input.comments[item.name] })),
        feedback_to_student: input.feedback,
      });
      if (!checked.ok) return { ok: false, reason: "invalid_input" };
      const next = toStoredGrade(checked.result);
      await db.$transaction([
        db.grade.update({ where: { id: gradeId }, data: { resultJson: next as unknown as Prisma.InputJsonValue, total: next.total } }),
        log("edited", { before: summary(stored), after: summary(next) } as Prisma.InputJsonValue),
      ]);
      return { ok: true, gradeId };
    }
    case "confirm": {
      if (grade.status !== "AI_GRADED") return { ok: false, reason: "invalid_state" };
      await db.$transaction([db.grade.update({ where: { id: gradeId }, data: { status: "TEACHER_CONFIRMED" } }), log("confirmed", { total: stored?.total ?? null })]);
      return { ok: true, gradeId };
    }
    case "publish": {
      if (grade.status !== "TEACHER_CONFIRMED") return { ok: false, reason: "invalid_state" };
      await db.$transaction([db.grade.update({ where: { id: gradeId }, data: { status: "PUBLISHED" } }), log("published", { total: stored?.total ?? null })]);
      return { ok: true, gradeId };
    }
    case "retry": {
      if (grade.status !== "PENDING") return { ok: false, reason: "invalid_state" };
      const result = await gradeVersion(gradeId, model);
      return result ? { ok: true, gradeId } : { ok: false, reason: "grading_failed" };
    }
    case "regrade": {
      const created = await db.$transaction(async (tx) => {
        const next = await tx.grade.create({ data: { attemptId: grade.attemptId, version: grade.version + 1, status: "PENDING" }, select: { id: true } });
        await tx.gradeAuditLog.create({
          data: { gradeId, actorEmail: teacherEmail, action: "regrade_requested", detailJson: { note: input.note, newVersion: grade.version + 1 } },
        });
        return next;
      });
      const result = await gradeVersion(created.id, model, input.note);
      return result ? { ok: true, gradeId: created.id } : { ok: false, reason: "grading_failed" };
    }
  }
}

// ---------------------------------------------------------------- detail

export interface GradeVersionView {
  id: string;
  version: number;
  status: GradeStatus;
  result: StoredGrade | null;
  createdAt: string;
  audit: { action: string; actor: string; at: string; detail: unknown }[];
}

export const ACTION_LABELS: Record<string, string> = {
  ai_graded: "AI 評分完成",
  ai_failed: "AI 評分失敗",
  edited: "老師修改",
  regrade_requested: "老師請 AI 重改",
  confirmed: "老師確認",
  published: "已公佈",
};

export const GRADE_STATUS_LABELS: Record<GradeStatus, string> = {
  PENDING: "待評分",
  AI_GRADED: "AI 已評",
  TEACHER_CONFIRMED: "教師已確認",
  PUBLISHED: "已公佈",
};

export async function getReviewDetail(attemptId: string) {
  const attempt = await getDb().attempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      status: true,
      code: true,
      startedAt: true,
      finishedAt: true,
      user: { select: { name: true, email: true } },
      problem: { select: { title: true, slug: true, languageId: true } },
      messages: { orderBy: { createdAt: "asc" }, select: { id: true, role: true, content: true, createdAt: true } },
      editEvents: { orderBy: { createdAt: "asc" }, select: { insertedChars: true, deletedChars: true, kind: true, flagged: true, createdAt: true } },
      runs: { orderBy: { createdAt: "asc" }, select: { kind: true, passedCount: true, totalCount: true, resultJson: true, createdAt: true } },
      grades: {
        orderBy: { version: "desc" },
        select: {
          id: true,
          version: true,
          status: true,
          resultJson: true,
          createdAt: true,
          auditLogs: { orderBy: { createdAt: "asc" }, select: { action: true, actorEmail: true, createdAt: true, detailJson: true } },
        },
      },
    },
  });
  if (!attempt || attempt.status === "IN_PROGRESS") return null;
  const grades: GradeVersionView[] = attempt.grades.map((grade) => ({
    id: grade.id,
    version: grade.version,
    status: grade.status,
    result: grade.resultJson as unknown as StoredGrade | null,
    createdAt: grade.createdAt.toISOString(),
    audit: grade.auditLogs.map((entry) => ({ action: entry.action, actor: entry.actorEmail, at: entry.createdAt.toISOString(), detail: entry.detailJson })),
  }));
  return { ...attempt, grades };
}

export { LEVEL_LABELS };
