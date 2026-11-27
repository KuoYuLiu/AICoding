import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), findUnique: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ getDb: () => ({ problem: { findUnique: mocks.findUnique } }) }));

import { GET } from "./route";

const call = (slug: string) =>
  GET(new Request(`http://localhost/api/problems/${slug}`), { params: Promise.resolve({ slug }) });

describe("GET /api/problems/[slug]", () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.findUnique.mockReset();
  });

  it("requires sign-in", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await call("sum-to-n")).status).toBe(401);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown problem", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "u1" } });
    mocks.findUnique.mockResolvedValue(null);
    expect((await call("nope")).status).toBe(404);
  });

  it("never selects or returns the reference solution or hidden tests", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "u1" } });
    // Even if the database handed back everything, the response must stay clean.
    mocks.findUnique.mockResolvedValue({
      slug: "sum-to-n",
      title: "從 1 加到 n",
      statement: "S",
      languageId: "python-3",
      referenceSolution: "SECRET_SOLUTION",
      testCases: [
        { name: "sample-01", input: "5\n", expectedOutput: "15\n", hidden: false },
        { name: "secret-01", input: "SECRET_INPUT", expectedOutput: "SECRET_OUTPUT", hidden: true },
      ],
    });

    const response = await call("sum-to-n");
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toMatch(/SECRET/);
    expect(JSON.parse(text).samples).toHaveLength(1);

    const query = mocks.findUnique.mock.calls[0][0];
    expect(query.select.referenceSolution).toBeUndefined();
    expect(query.select.testCases.where).toEqual({ hidden: false });
  });
});
