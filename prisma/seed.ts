import path from "node:path";
import { config } from "dotenv";
import { getDb } from "@/lib/db";
import { findFailingTestCases, loadAllProblemPackages } from "@/lib/problems/package";
import { createRunner } from "@/lib/runner";

config({ path: ".env.local" });
config();

const skipVerify = process.argv.includes("--skip-verify");

async function main() {
  const problems = loadAllProblemPackages(path.join(process.cwd(), "problems"));
  const runner = skipVerify ? null : createRunner();
  const db = getDb();

  for (const problem of problems) {
    if (runner) {
      const failing = await findFailingTestCases(runner, problem);
      if (failing.length > 0) {
        const names = failing.map((result) => `${result.name} (${result.run.status})`).join(", ");
        throw new Error(`Reference solution of ${problem.slug} fails: ${names}`);
      }
    }

    await db.$transaction(async (tx) => {
      const data = {
        title: problem.title,
        statement: problem.statement,
        languageId: problem.languageId,
        referenceSolution: problem.referenceSolution,
        variationHint: problem.variationHint,
      };
      const saved = await tx.problem.upsert({
        where: { slug: problem.slug },
        create: { slug: problem.slug, ...data },
        update: data,
      });
      await tx.testCase.deleteMany({ where: { problemId: saved.id } });
      await tx.testCase.createMany({
        data: problem.testCases.map((testCase, order) => ({ problemId: saved.id, order, ...testCase })),
      });
    });

    const hidden = problem.testCases.filter((testCase) => testCase.hidden).length;
    console.log(
      `✓ ${problem.slug}: ${problem.testCases.length - hidden} sample + ${hidden} hidden test cases` +
        (runner ? ", reference solution passes all" : " (not verified)"),
    );
  }
  await db.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
