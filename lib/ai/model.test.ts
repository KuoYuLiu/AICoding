import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { ClaudeAssistantModel, createAssistantModel, FakeAssistantModel, REFUSAL_REPLY } from "./model";

function clientReturning(response: unknown) {
  const create = vi.fn().mockResolvedValue(response);
  return { client: { beta: { messages: { create } } } as unknown as Anthropic, create };
}

const usage = { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 90 };
const request = { system: "SYSTEM", history: [{ role: "user" as const, content: "嗨" }], status: "STATUS" };

describe("ClaudeAssistantModel", () => {
  it("caches the system prompt, sends the status last and parses the structured reply", async () => {
    const { client, create } = clientReturning({
      stop_reason: "end_turn",
      usage,
      content: [{ type: "text", text: JSON.stringify({ reply: "你覺得呢？", stage: 2 }) }],
    });
    const reply = await new ClaudeAssistantModel("claude-opus-5-5", client).generate({ ...request, correction: "請重寫" });

    expect(reply).toEqual({ reply: "你覺得呢？", stage: 2, inputTokens: 100, outputTokens: 5 });
    const params = create.mock.calls[0][0];
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.system).toEqual([{ type: "text", text: "SYSTEM", cache_control: { type: "ephemeral" } }]);
    expect(params.messages.at(-1)).toEqual({ role: "system", content: "STATUS\n\n# 重寫要求\n請重寫" });
    expect(params.output_config.format.type).toBe("json_schema");
  });

  it("turns a refusal into a gentle redirect", async () => {
    const { client } = clientReturning({ stop_reason: "refusal", usage, content: [] });
    const reply = await new ClaudeAssistantModel("claude-opus-5-5", client).generate(request);
    expect(reply.reply).toBe(REFUSAL_REPLY);
    expect(reply.stage).toBe(0);
  });
});

describe("createAssistantModel", () => {
  it("uses the fake model only when asked", () => {
    expect(createAssistantModel({ NODE_ENV: "test", AI_PROVIDER: "fake" })).toBeInstanceOf(FakeAssistantModel);
    expect(createAssistantModel({ NODE_ENV: "test", ANTHROPIC_API_KEY: "test-key" })).toBeInstanceOf(ClaudeAssistantModel);
  });
});
