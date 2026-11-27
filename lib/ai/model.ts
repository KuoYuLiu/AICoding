import Anthropic from "@anthropic-ai/sdk";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ModelRequest {
  /** Stable per problem: main prompt, problem, samples, safety rules. Cached. */
  system: string;
  history: ChatTurn[];
  /** Volatile per turn: current code, run results, stage. Sent as a trailing system message. */
  status: string;
  /** Set when the previous draft failed the output check. */
  correction?: string;
}

export interface ModelReply {
  reply: string;
  stage: number;
  inputTokens: number;
  outputTokens: number;
}

export interface AssistantModel {
  generate(request: ModelRequest): Promise<ModelReply>;
}

const REPLY_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string", description: "給學生看的回覆，繁體中文" },
    stage: { type: "integer", enum: [1, 2, 3, 4], description: "學生目前所在的引導階段" },
  },
  required: ["reply", "stage"],
  additionalProperties: false,
} as const;

export const REFUSAL_REPLY = "這個問題我沒辦法回答。我們回到題目吧：你現在卡在哪一步？";

export class ClaudeAssistantModel implements AssistantModel {
  private readonly client: Anthropic;

  constructor(
    private readonly model = process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
    client?: Anthropic,
  ) {
    this.client = client ?? new Anthropic();
  }

  async generate({ system, history, status, correction }: ModelRequest): Promise<ModelReply> {
    const trailing = correction ? `${status}\n\n# 重寫要求\n${correction}` : status;
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // Short Socratic chat turns: low effort keeps replies quick and cheap.
      output_config: { effort: "low", format: { type: "json_schema", schema: REPLY_SCHEMA } },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [...history.map((turn) => ({ role: turn.role, content: turn.content })), { role: "system", content: trailing }],
    });

    const usage = response.usage;
    const inputTokens = usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
    if (response.stop_reason === "refusal") {
      return { reply: REFUSAL_REPLY, stage: 0, inputTokens, outputTokens: usage.output_tokens };
    }
    const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    const parsed = JSON.parse(text) as { reply: string; stage: number };
    return { reply: parsed.reply, stage: parsed.stage, inputTokens, outputTokens: usage.output_tokens };
  }
}

/**
 * Deterministic stand-in for tests and CI (AI_PROVIDER=fake). It never sees real student data.
 * The trigger word __FAKE_LEAK__ makes its first draft include a full solution, to exercise the output check.
 */
export class FakeAssistantModel implements AssistantModel {
  async generate({ history, correction }: ModelRequest): Promise<ModelReply> {
    const last = history.at(-1)?.content ?? "";
    const studentTurns = history.filter((turn) => turn.role === "user").length;
    const stage = Math.min(4, 1 + Math.floor(studentTurns / 2));
    if (last.includes("__FAKE_LEAK__") && !correction) {
      return {
        reply: "好吧，答案是：\n```python\nn = int(input())\ntotal = 0\nfor i in range(1, n + 1):\n    total += i\nprint(total)\n```",
        stage,
        inputTokens: 10,
        outputTokens: 10,
      };
    }
    if (last.includes("錯誤")) {
      return { reply: "我們一起看看這個錯誤。錯誤訊息最後一行說了什麼？你覺得它指向哪一行？", stage, inputTokens: 10, outputTokens: 10 };
    }
    return { reply: "很好的開始！先用你自己的話說說看：這題的輸入是什麼？", stage, inputTokens: 10, outputTokens: 10 };
  }
}

export function createAssistantModel(env: NodeJS.ProcessEnv = process.env): AssistantModel {
  return env.AI_PROVIDER === "fake" ? new FakeAssistantModel() : new ClaudeAssistantModel();
}
