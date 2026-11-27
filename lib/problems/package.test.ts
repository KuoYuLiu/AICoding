import path from "node:path";
import { describe, expect, it } from "vitest";
import { DockerRunner } from "@/lib/runner/docker";
import type { CodeRunner } from "@/lib/runner";
import { findFailingTestCases, loadAllProblemPackages, loadProblemPackage } from "./package";

const root = path.join(process.cwd(), "problems");
const sumToN = loadProblemPackage(path.join(root, "sum-to-n"));

describe("loadProblemPackage", () => {
  it("reads metadata, statement, reference solution and test cases", () => {
    expect(sumToN).toMatchObject({ slug: "sum-to-n", languageId: "python-3", variationHint: expect.any(String) });
    expect(sumToN.statement).toContain("## 輸入");
    expect(sumToN.referenceSolution).toContain("print(");
    expect(sumToN.testCases.filter((testCase) => !testCase.hidden).map((testCase) => testCase.name)).toEqual([
      "sample-01",
      "sample-02",
    ]);
    expect(sumToN.testCases.filter((testCase) => testCase.hidden)).toHaveLength(6);
  });

  it("finds every problem folder", () => {
    expect(loadAllProblemPackages(root).map((problem) => problem.slug)).toContain("sum-to-n");
  });
});

describe("findFailingTestCases", () => {
  it("reports test cases whose output differs", async () => {
    const alwaysFifteen: CodeRunner = {
      run: async () => ({ status: "ok", stdout: "15\n", stderr: "", timeSec: null, memoryKb: null }),
    };
    const failing = await findFailingTestCases(alwaysFifteen, sumToN);
    expect(failing.map((result) => result.name)).not.toContain("sample-01");
    expect(failing).toHaveLength(sumToN.testCases.length - 1);
  });
});

// Real execution: DOCKER_TESTS=1 npm test
describe.runIf(process.env.DOCKER_TESTS === "1")("reference solutions with real Docker", () => {
  it.each(loadAllProblemPackages(root).map((problem) => [problem.slug, problem] as const))(
    "%s passes all its test cases",
    async (_slug, problem) => {
      expect(await findFailingTestCases(new DockerRunner(), problem)).toEqual([]);
    },
    60_000,
  );
});
