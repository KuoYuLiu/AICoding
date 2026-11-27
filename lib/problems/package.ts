import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { getLanguage } from "@/lib/languages";
import { runTestCases, type CodeRunner, type TestCase, type TestCaseResult } from "@/lib/runner";

/**
 * A problem on disk, in a DOMjudge-like layout:
 *   problem.json, statement.md, data/sample/*.in|.ans, data/secret/*.in|.ans, submissions/accepted/<one file>
 * Holds the reference solution and hidden tests, so it is server-only.
 */
export interface ProblemPackage {
  slug: string;
  title: string;
  languageId: string;
  variationHint: string | null;
  statement: string;
  referenceSolution: string;
  testCases: TestCase[];
}

interface ProblemMeta {
  slug: string;
  title: string;
  languageId: string;
  variationHint?: string;
}

function readTestCases(dir: string, hidden: boolean): TestCase[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".in"))
    .sort()
    .map((file) => {
      const base = file.slice(0, -".in".length);
      const answerPath = path.join(dir, `${base}.ans`);
      if (!existsSync(answerPath)) {
        throw new Error(`Missing answer file: ${answerPath}`);
      }
      return {
        name: `${hidden ? "secret" : "sample"}-${base}`,
        input: readFileSync(path.join(dir, file), "utf8"),
        expectedOutput: readFileSync(answerPath, "utf8"),
        hidden,
      };
    });
}

export function loadProblemPackage(dir: string): ProblemPackage {
  const meta = JSON.parse(readFileSync(path.join(dir, "problem.json"), "utf8")) as ProblemMeta;
  getLanguage(meta.languageId); // fail early on an unknown language

  const acceptedDir = path.join(dir, "submissions", "accepted");
  const solutions = existsSync(acceptedDir) ? readdirSync(acceptedDir).sort() : [];
  if (solutions.length === 0) {
    throw new Error(`No reference solution in ${acceptedDir}`);
  }

  const testCases = [
    ...readTestCases(path.join(dir, "data", "sample"), false),
    ...readTestCases(path.join(dir, "data", "secret"), true),
  ];
  if (!testCases.some((testCase) => testCase.hidden)) {
    throw new Error(`Problem ${meta.slug} has no hidden test cases`);
  }

  return {
    slug: meta.slug,
    title: meta.title,
    languageId: meta.languageId,
    variationHint: meta.variationHint ?? null,
    statement: readFileSync(path.join(dir, "statement.md"), "utf8"),
    referenceSolution: readFileSync(path.join(acceptedDir, solutions[0]), "utf8"),
    testCases,
  };
}

/** Every problem folder under `root` (folders without problem.json are ignored). */
export function loadAllProblemPackages(root: string): ProblemPackage[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(root, entry.name, "problem.json")))
    .map((entry) => loadProblemPackage(path.join(root, entry.name)));
}

/** Runs the reference solution against every test case; returns the ones that fail. */
export async function findFailingTestCases(runner: CodeRunner, problem: ProblemPackage): Promise<TestCaseResult[]> {
  const results = await runTestCases(runner, getLanguage(problem.languageId), problem.referenceSolution, problem.testCases);
  return results.filter((result) => !result.passed);
}
