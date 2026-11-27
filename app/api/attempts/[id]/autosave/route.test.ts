import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  createMany: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    attempt: { findUnique: mocks.findUnique, update: mocks.update },
    editEvent: { createMany: mocks.createMany },
    $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
  }),
}));

import { POST } from "./route";

const call = (body: unknown, id = "a1") =>
  POST(new Request(`http://localhost/api/attempts/${id}/autosave`, { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });

const body = {
  code: "n = int(input())",
  edits: [
    { at: Date.now(), inserted: 1, deleted: 0, kind: "edit" },
    { at: Date.now(), inserted: 80, deleted: 0, kind: "edit" },
    { at: Date.now(), inserted: 80, deleted: 0, kind: "undo" },
  ],
};

describe("POST /api/attempts/[id]/autosave", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "u1" } });
    mocks.findUnique.mockResolvedValue({ userId: "u1", status: "IN_PROGRESS" });
    mocks.update.mockResolvedValue({ updatedAt: new Date("2026-11-27T07:00:00Z") });
    mocks.createMany.mockResolvedValue({ count: 3 });
  });

  it("requires sign-in", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await call(body)).status).toBe(401);
  });

  it("rejects malformed bodies", async () => {
    expect((await call({ code: 1 })).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("hides other students' attempts", async () => {
    mocks.findUnique.mockResolvedValue({ userId: "someone-else", status: "IN_PROGRESS" });
    expect((await call(body)).status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("refuses to change a finished attempt", async () => {
    mocks.findUnique.mockResolvedValue({ userId: "u1", status: "COMPLETED" });
    expect((await call(body)).status).toBe(409);
  });

  it("saves the code and flags only the large typed insertion", async () => {
    const response = await call(body);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ savedAt: "2026-11-27T07:00:00.000Z" });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { code: body.code } }));

    const rows = mocks.createMany.mock.calls[0][0].data as { flagged: boolean; kind: string }[];
    expect(rows.map((row) => [row.kind, row.flagged])).toEqual([
      ["edit", false],
      ["edit", true],
      ["undo", false],
    ]);
  });
});
