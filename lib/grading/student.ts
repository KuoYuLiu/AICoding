import { getDb } from "@/lib/db";
import type { StoredGrade } from "./rubric";

/** What a student sees once a grade is published: levels, total and feedback. No evidence, flags or confidence. */
export interface PublishedGradeView {
  total: number;
  levels: { name: string; level: number }[];
  feedback: string;
}

export function toPublishedGradeView(stored: StoredGrade): PublishedGradeView {
  return {
    total: stored.total,
    levels: stored.dimensions.map((dimension) => ({ name: dimension.name, level: dimension.level })),
    feedback: stored.feedback_to_student,
  };
}

/** The student's grade for an attempt, only if a teacher has published it. */
export async function getPublishedGrade(attemptId: string): Promise<PublishedGradeView | null> {
  const grade = await getDb().grade.findFirst({
    where: { attemptId, status: "PUBLISHED" },
    orderBy: { version: "desc" },
    select: { resultJson: true },
  });
  return grade?.resultJson ? toPublishedGradeView(grade.resultJson as unknown as StoredGrade) : null;
}
