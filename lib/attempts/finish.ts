import { getDb } from "@/lib/db";
import type { AttemptStatus } from "@/lib/generated/prisma/enums";

export type FinishOutcome =
  | { ok: true; status: AttemptStatus; gradeId: string }
  | { ok: false; reason: "not_found" | "closed" };

/**
 * Ends an attempt and hands it to grading. It is COMPLETED when the latest submission passed every
 * hidden test, otherwise INCOMPLETE (reflection then scores 1). The attempt is locked from here on.
 */
export async function finishAttempt(attemptId: string, userId: string, now: Date = new Date()): Promise<FinishOutcome> {
  const db = getDb();
  const attempt = await db.attempt.findUnique({ where: { id: attemptId }, select: { userId: true, status: true } });
  if (!attempt || attempt.userId !== userId) return { ok: false, reason: "not_found" };
  if (attempt.status !== "IN_PROGRESS") return { ok: false, reason: "closed" };

  const latestSubmit = await db.runRecord.findFirst({
    where: { attemptId, kind: "submit" },
    orderBy: { createdAt: "desc" },
    select: { passedCount: true, totalCount: true },
  });
  const passedAll = Boolean(latestSubmit && latestSubmit.totalCount > 0 && latestSubmit.passedCount === latestSubmit.totalCount);
  const status: AttemptStatus = passedAll ? "COMPLETED" : "INCOMPLETE";

  // Only lock attempts that are still open, so two clicks cannot create two grades.
  const [locked, grade] = await db.$transaction(async (tx) => {
    const updated = await tx.attempt.updateMany({ where: { id: attemptId, status: "IN_PROGRESS" }, data: { status, finishedAt: now } });
    if (updated.count === 0) return [false, null] as const;
    const created = await tx.grade.create({ data: { attemptId, version: 1, status: "PENDING" }, select: { id: true } });
    return [true, created] as const;
  });
  if (!locked || !grade) return { ok: false, reason: "closed" };
  return { ok: true, status, gradeId: grade.id };
}
