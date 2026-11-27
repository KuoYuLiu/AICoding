import { getDb } from "@/lib/db";
import { toPublicProblem, type PublicProblem } from "./public";

/** Loads the student-facing view. The query itself never selects the reference solution or hidden tests. */
export async function getPublicProblem(slug: string): Promise<PublicProblem | null> {
  const problem = await getDb().problem.findUnique({
    where: { slug },
    select: {
      slug: true,
      title: true,
      statement: true,
      languageId: true,
      testCases: {
        where: { hidden: false },
        orderBy: { order: "asc" },
        select: { name: true, input: true, expectedOutput: true, hidden: true },
      },
    },
  });
  return problem ? toPublicProblem(problem) : null;
}

export async function findProblemId(slug: string): Promise<string | null> {
  const problem = await getDb().problem.findUnique({ where: { slug }, select: { id: true } });
  return problem?.id ?? null;
}
