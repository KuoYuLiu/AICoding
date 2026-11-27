import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), runAttempt: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("./run", () => ({ runAttempt: mocks.runAttempt }));

import { handleRunRequest } from "./run-route";

const post = (body: unknown) => new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) });

describe("handleRunRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "u1" } });
  });

  it("requires sign-in and a code string", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    expect((await handleRunRequest(post({ code: "x" }), "a1", "run")).status).toBe(401);
    expect((await handleRunRequest(post({ code: 1 }), "a1", "run")).status).toBe(400);
    expect(mocks.runAttempt).not.toHaveBeenCalled();
  });

  it("maps outcomes to status codes", async () => {
    mocks.runAttempt.mockResolvedValueOnce({ ok: false, reason: "rate_limited", retryAfterSec: 12 });
    const limited = await handleRunRequest(post({ code: "x" }), "a1", "run");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("12");
    expect((await limited.json()).error).toContain("12 秒");

    mocks.runAttempt.mockResolvedValueOnce({ ok: false, reason: "closed" });
    expect((await handleRunRequest(post({ code: "x" }), "a1", "submit")).status).toBe(409);
    mocks.runAttempt.mockResolvedValueOnce({ ok: false, reason: "not_found" });
    expect((await handleRunRequest(post({ code: "x" }), "a1", "submit")).status).toBe(404);

    mocks.runAttempt.mockResolvedValueOnce({ ok: true, view: { kind: "submit", passed: 1, total: 1, createdAt: "", cases: [] } });
    const ok = await handleRunRequest(post({ code: "x" }), "a1", "submit");
    expect(ok.status).toBe(200);
    expect(mocks.runAttempt).toHaveBeenLastCalledWith("a1", "u1", "submit", "x");
  });
});
