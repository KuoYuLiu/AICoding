import { getDb } from "@/lib/db";
import type { AttemptStatus } from "@/lib/generated/prisma/enums";
import { clampEditTime, isFlaggedEdit, type AutosavePayload } from "./edit-history";

export interface AttemptView {
  id: string;
  status: AttemptStatus;
  code: string;
  stage: number;
  updatedAt: string;
}

/** Stage 0 has no redo: a student keeps one attempt per problem. */
export async function getOrCreateAttempt(userId: string, problemId: string): Promise<AttemptView> {
  const db = getDb();
  const existing = await db.attempt.findFirst({
    where: { userId, problemId },
    orderBy: { startedAt: "desc" },
  });
  const attempt = existing ?? (await db.attempt.create({ data: { userId, problemId } }));
  return {
    id: attempt.id,
    status: attempt.status,
    code: attempt.code,
    stage: attempt.stage,
    updatedAt: attempt.updatedAt.toISOString(),
  };
}

export type AutosaveResult = { ok: true; savedAt: string; flagged: number } | { ok: false; reason: "not_found" | "closed" };

export async function saveAutosave(attemptId: string, userId: string, payload: AutosavePayload): Promise<AutosaveResult> {
  const db = getDb();
  const attempt = await db.attempt.findUnique({ where: { id: attemptId }, select: { userId: true, status: true } });
  // Someone else's attempt looks the same as a missing one.
  if (!attempt || attempt.userId !== userId) return { ok: false, reason: "not_found" };
  if (attempt.status !== "IN_PROGRESS") return { ok: false, reason: "closed" };

  const now = Date.now();
  const rows = payload.edits.map((edit) => ({
    attemptId,
    insertedChars: edit.inserted,
    deletedChars: edit.deleted,
    kind: edit.kind,
    flagged: isFlaggedEdit(edit),
    createdAt: clampEditTime(edit.at, now),
  }));

  const [updated] = await db.$transaction([
    db.attempt.update({ where: { id: attemptId }, data: { code: payload.code }, select: { updatedAt: true } }),
    db.editEvent.createMany({ data: rows }),
  ]);
  return { ok: true, savedAt: updated.updatedAt.toISOString(), flagged: rows.filter((row) => row.flagged).length };
}

export interface ProblemSummary {
  slug: string;
  title: string;
  languageId: string;
  attemptStatus: AttemptStatus | null;
  /** Only a published grade's total; null until the teacher publishes. */
  publishedTotal: number | null;
}

export async function listProblemsForUser(userId: string): Promise<ProblemSummary[]> {
  const problems = await getDb().problem.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      slug: true,
      title: true,
      languageId: true,
      attempts: {
        where: { userId },
        orderBy: { startedAt: "desc" },
        take: 1,
        select: { status: true, grades: { where: { status: "PUBLISHED" }, orderBy: { version: "desc" }, take: 1, select: { total: true } } },
      },
    },
  });
  return problems.map(({ attempts, ...problem }) => ({
    ...problem,
    attemptStatus: attempts[0]?.status ?? null,
    publishedTotal: attempts[0]?.grades[0]?.total ?? null,
  }));
}
