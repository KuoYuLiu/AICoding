/** What a student's browser may see. Never add the reference solution or hidden tests here. */
export interface PublicProblem {
  slug: string;
  title: string;
  statement: string;
  languageId: string;
  samples: { name: string; input: string; expectedOutput: string }[];
}

interface ProblemWithTests {
  slug: string;
  title: string;
  statement: string;
  languageId: string;
  testCases: { name: string; input: string; expectedOutput: string; hidden: boolean }[];
}

/** Builds the public view field by field, so new server-side columns never leak by accident. */
export function toPublicProblem(problem: ProblemWithTests): PublicProblem {
  return {
    slug: problem.slug,
    title: problem.title,
    statement: problem.statement,
    languageId: problem.languageId,
    samples: problem.testCases
      .filter((testCase) => !testCase.hidden)
      .map(({ name, input, expectedOutput }) => ({ name, input, expectedOutput })),
  };
}
