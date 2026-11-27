import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), apply: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/grading/review", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./review")>()),
  applyReviewAction: mocks.apply,
}));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));

import { POST } from "@/app/api/teacher/grades/[id]/route";

const post = (body: unknown) => new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) });
const context = { params: Promise.resolve({ id: "g1" }) };

describe("POST /api/teacher/grades/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "t1", email: "t@example.test", role: "TEACHER" } });
  });

  it("is for teachers only", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    expect((await POST(post({ action: "confirm" }), context)).status).toBe(401);
    mocks.auth.mockResolvedValueOnce({ user: { id: "s1", email: "s@example.test", role: "STUDENT" } });
    expect((await POST(post({ action: "publish" }), context)).status).toBe(403);
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("validates the action and maps outcomes", async () => {
    expect((await POST(post({ action: "nope" }), context)).status).toBe(400);
    mocks.apply.mockResolvedValueOnce({ ok: false, reason: "invalid_state" });
    expect((await POST(post({ action: "publish" }), context)).status).toBe(409);
    mocks.apply.mockResolvedValueOnce({ ok: true, gradeId: "g1" });
    const ok = await POST(post({ action: "confirm" }), context);
    expect(ok.status).toBe(200);
    expect(mocks.apply).toHaveBeenLastCalledWith("g1", "t@example.test", { action: "confirm" });
  });
});
