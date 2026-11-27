import { latestRunViews } from "@/lib/attempts/run";
import { getDb } from "@/lib/db";
import { getLanguage } from "@/lib/languages";
import { CORRECTIONS, SAFE_FALLBACK_REPLY, checkReply } from "./guards";
import { createAssistantModel, REFUSAL_REPLY, type AssistantModel, type ChatTurn, type ModelRequest } from "./model";
import { buildAssistantSystemPrompt } from "./prompts";
import { buildStatusMessage } from "./status";
import { GREETING, MAX_MESSAGE_CHARS, type ChatMessageView } from "./chat-constants";

export { GREETING, MAX_MESSAGE_CHARS, type ChatMessageView };

/** Student messages per minute. */
export const CHAT_PER_MINUTE = 12;
/** Earlier turns sent to the model. */
const HISTORY_TURNS = 40;

export async function listChat(attemptId: string): Promise<ChatMessageView[]> {
  const rows = await getDb().chatMessage.findMany({
    where: { attemptId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, createdAt: true },
  });
  return rows.map((row) => ({
    id: row.id,
    role: row.role === "STUDENT" ? "student" : "assistant",
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  }));
}

export type ChatOutcome =
  | { ok: true; reply: ChatMessageView; stage: number }
  | { ok: false; reason: "not_found" | "closed" | "empty" | "too_long" }
  | { ok: false; reason: "rate_limited"; retryAfterSec: number };

export async function respond(
  attemptId: string,
  userId: string,
  rawMessage: string,
  model: AssistantModel = createAssistantModel(),
  now: Date = new Date(),
): Promise<ChatOutcome> {
  const message = rawMessage.trim();
  if (!message) return { ok: false, reason: "empty" };
  if (message.length > MAX_MESSAGE_CHARS) return { ok: false, reason: "too_long" };

  const db = getDb();
  const attempt = await db.attempt.findUnique({
    where: { id: attemptId },
    select: {
      userId: true,
      status: true,
      stage: true,
      code: true,
      problem: {
        select: {
          statement: true,
          languageId: true,
          referenceSolution: true,
          variationHint: true,
          testCases: { where: { hidden: false }, orderBy: { order: "asc" }, select: { input: true, expectedOutput: true } },
        },
      },
    },
  });
  if (!attempt || attempt.userId !== userId) return { ok: false, reason: "not_found" };
  if (attempt.status !== "IN_PROGRESS") return { ok: false, reason: "closed" };

  const recent = await db.chatMessage.findMany({
    where: { role: "STUDENT", attempt: { userId }, createdAt: { gt: new Date(now.getTime() - 60_000) } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
    take: CHAT_PER_MINUTE,
  });
  if (recent.length >= CHAT_PER_MINUTE) {
    return {
      ok: false,
      reason: "rate_limited",
      retryAfterSec: Math.max(1, Math.ceil((recent[0].createdAt.getTime() + 60_000 - now.getTime()) / 1000)),
    };
  }

  const earlier = await db.chatMessage.findMany({
    where: { attemptId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_TURNS,
    select: { role: true, content: true },
  });
  await db.chatMessage.create({ data: { attemptId, role: "STUDENT", content: message, stage: attempt.stage } });

  const history = buildChatHistory(
    earlier.reverse().map((row) => ({ role: row.role === "STUDENT" ? ("user" as const) : ("assistant" as const), content: row.content })),
    message,
  );

  const language = getLanguage(attempt.problem.languageId);
  const { run, submit } = await latestRunViews(attemptId, language.id);
  const system = buildAssistantSystemPrompt({
    statement: attempt.problem.statement,
    samples: attempt.problem.testCases,
    variationHint: attempt.problem.variationHint,
  });
  const status = buildStatusMessage({ stage: attempt.stage, code: attempt.code, languageHints: language.aiHints, run, submit });

  const draft = await generateCheckedReply(model, { system, history, status }, attempt.problem.referenceSolution, attempt.code);
  const reply = draft.reply;

  // Stage only moves within 1–4 here and at most one step forward per turn; stage 5 starts when all hidden tests pass.
  const proposed = Number.isInteger(draft.stage) && draft.stage >= 1 && draft.stage <= 4 ? draft.stage : attempt.stage;
  const stage = attempt.stage >= 5 ? attempt.stage : Math.min(proposed, attempt.stage + 1);

  const [saved] = await db.$transaction([
    db.chatMessage.create({
      data: { attemptId, role: "ASSISTANT", content: reply, stage, inputTokens: draft.inputTokens, outputTokens: draft.outputTokens },
      select: { id: true, createdAt: true },
    }),
    db.attempt.update({ where: { id: attemptId }, data: { stage } }),
  ]);
  return { ok: true, stage, reply: { id: saved.id, role: "assistant", content: reply, createdAt: saved.createdAt.toISOString() } };
}

export interface CheckedReply {
  reply: string;
  stage: number;
  inputTokens: number;
  outputTokens: number;
  /** The first draft failed the output check, so the model was asked to rewrite it. */
  rewritten: boolean;
  /** The rewrite failed too, so the safe fallback reply was used. */
  fellBack: boolean;
}

/** One assistant turn with the output check: a failing draft is rewritten once, then replaced by a safe reply. */
export async function generateCheckedReply(
  model: AssistantModel,
  request: Omit<ModelRequest, "correction">,
  referenceSolution: string,
  studentCode: string,
): Promise<CheckedReply> {
  let draft = await model.generate(request);
  let inputTokens = draft.inputTokens;
  let outputTokens = draft.outputTokens;
  let problem = checkReply(draft.reply, referenceSolution, studentCode);
  const rewritten = problem !== null;
  if (problem) {
    draft = await model.generate({ ...request, correction: CORRECTIONS[problem] });
    inputTokens += draft.inputTokens;
    outputTokens += draft.outputTokens;
    problem = checkReply(draft.reply, referenceSolution, studentCode);
  }
  const fellBack = problem !== null;
  return {
    reply: fellBack ? SAFE_FALLBACK_REPLY : draft.reply.trim() || REFUSAL_REPLY,
    stage: draft.stage,
    inputTokens,
    outputTokens,
    rewritten,
    fellBack,
  };
}

/** Earlier turns (oldest first) plus the new message, in the shape the model expects. */
export function buildChatHistory(earlier: ChatTurn[], message: string): ChatTurn[] {
  const history: ChatTurn[] = [...earlier, { role: "user", content: message }];
  // The greeting is shown in the UI as the first assistant turn; the model sees it too.
  if (history[0]?.role === "user") history.unshift({ role: "assistant", content: GREETING });
  // The API requires the first message to come from the user.
  history.unshift({ role: "user", content: "（學生打開了這一題）" });
  return history;
}
