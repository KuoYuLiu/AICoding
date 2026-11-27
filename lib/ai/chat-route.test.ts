import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), respond: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/ai/assistant", () => ({ respond: mocks.respond }));

import { POST } from "@/app/api/attempts/[id]/chat/route";

const post = (body: unknown) => new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) });
const context = { params: Promise.resolve({ id: "a1" }) };

describe("POST /api/attempts/[id]/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "u1" } });
  });

  it("requires sign-in and a message string", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    expect((await POST(post({ message: "嗨" }), context)).status).toBe(401);
    expect((await POST(post({ message: 3 }), context)).status).toBe(400);
    expect(mocks.respond).not.toHaveBeenCalled();
  });

  it("maps outcomes to status codes", async () => {
    mocks.respond.mockResolvedValueOnce({ ok: false, reason: "rate_limited", retryAfterSec: 7 });
    const limited = await POST(post({ message: "嗨" }), context);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("7");

    for (const [reason, status] of [
      ["empty", 400],
      ["too_long", 413],
      ["closed", 409],
      ["not_found", 404],
    ] as const) {
      mocks.respond.mockResolvedValueOnce({ ok: false, reason });
      expect((await POST(post({ message: "嗨" }), context)).status).toBe(status);
    }

    const reply = { id: "m1", role: "assistant", content: "你覺得呢？", createdAt: "" };
    mocks.respond.mockResolvedValueOnce({ ok: true, reply, stage: 2 });
    const ok = await POST(post({ message: "嗨" }), context);
    expect(await ok.json()).toEqual({ reply, stage: 2 });
    expect(mocks.respond).toHaveBeenLastCalledWith("a1", "u1", "嗨");
  });

  it("hides model failures behind a friendly 502", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.respond.mockRejectedValueOnce(new Error("overloaded"));
    const failed = await POST(post({ message: "嗨" }), context);
    expect(failed.status).toBe(502);
    expect((await failed.json()).error).toContain("AI 助理暫時無法回應");
  });
});
