import { describe, expect, it } from "vitest";
import { toPublicProblem } from "./public";

describe("toPublicProblem", () => {
  it("keeps samples and drops hidden tests and server-only fields", () => {
    const view = toPublicProblem({
      slug: "p",
      title: "T",
      statement: "S",
      languageId: "python-3",
      referenceSolution: "SECRET_SOLUTION",
      variationHint: "hint",
      testCases: [
        { name: "sample-01", input: "5\n", expectedOutput: "15\n", hidden: false },
        { name: "secret-01", input: "SECRET_INPUT", expectedOutput: "SECRET_OUTPUT", hidden: true },
      ],
    } as Parameters<typeof toPublicProblem>[0]);

    expect(view.samples).toEqual([{ name: "sample-01", input: "5\n", expectedOutput: "15\n" }]);
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/SECRET|hidden|referenceSolution|variationHint/);
  });
});
