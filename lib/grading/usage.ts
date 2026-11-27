import { SAFE_FALLBACK_REPLY } from "@/lib/ai/guards";
import { getDb } from "@/lib/db";
import { DIMENSION_NAMES, type StoredGrade } from "./rubric";

/**
 * Claude Opus 5.5 list prices in US dollars per million tokens. Token counts here include cache reads,
 * which cost far less ($0.20), so the estimate is an upper bound.
 */
export const PRICE_PER_MTOK = { input: 4, output: 20 } as const;

export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (inputTokens * PRICE_PER_MTOK.input + outputTokens * PRICE_PER_MTOK.output) / 1_000_000;
}

export interface ProblemUsage {
  title: string;
  started: number;
  finished: number;
  studentTurns: number;
  avgTurns: number;
  assistantInput: number;
  assistantOutput: number;
  graderInput: number;
  graderOutput: number;
  costUsd: number;
  costPerAttemptUsd: number;
  safeFallbacks: number;
}

export interface Agreement {
  /** Published grades compared. */
  graded: number;
  /** Share of dimension levels the teacher left as the AI gave them. */
  exactRate: number | null;
  /** Share within one level. */
  withinOneRate: number | null;
  /** Mean absolute difference of the totals. */
  meanTotalDiff: number | null;
  perDimension: { name: string; exactRate: number | null }[];
}

interface AuditEntry {
  action: string;
  detailJson: unknown;
}

const tokensOf = (detail: unknown) => {
  const value = (detail ?? {}) as { inputTokens?: unknown; outputTokens?: unknown };
  return { input: Number(value.inputTokens) || 0, output: Number(value.outputTokens) || 0 };
};

/**
 * The AI's levels for a grade version: before the teacher's first edit, if any, otherwise the final levels.
 * (A regraded version counts as the AI's own result, since the AI produced it.)
 */
export function aiLevelsOf(final: StoredGrade, audit: AuditEntry[]): { levels: Record<string, number>; total: number } {
  const firstEdit = audit.find((entry) => entry.action === "edited");
  const before = (firstEdit?.detailJson as { before?: { levels?: Record<string, number>; total?: number } } | null)?.before;
  if (before?.levels && typeof before.total === "number") return { levels: before.levels, total: before.total };
  return { levels: Object.fromEntries(final.dimensions.map((item) => [item.name, item.level])), total: final.total };
}

export function computeAgreement(published: { result: StoredGrade; audit: AuditEntry[] }[]): Agreement {
  let pairs = 0;
  let exact = 0;
  let withinOne = 0;
  let totalDiff = 0;
  const perDimension = new Map<string, { pairs: number; exact: number }>(DIMENSION_NAMES.map((name) => [name, { pairs: 0, exact: 0 }]));
  for (const grade of published) {
    const ai = aiLevelsOf(grade.result, grade.audit);
    totalDiff += Math.abs(grade.result.total - ai.total);
    for (const dimension of grade.result.dimensions) {
      const aiLevel = ai.levels[dimension.name];
      if (typeof aiLevel !== "number") continue;
      pairs += 1;
      const stats = perDimension.get(dimension.name);
      if (stats) stats.pairs += 1;
      if (aiLevel === dimension.level) {
        exact += 1;
        if (stats) stats.exact += 1;
      }
      if (Math.abs(aiLevel - dimension.level) <= 1) withinOne += 1;
    }
  }
  const rate = (part: number, whole: number) => (whole === 0 ? null : part / whole);
  return {
    graded: published.length,
    exactRate: rate(exact, pairs),
    withinOneRate: rate(withinOne, pairs),
    meanTotalDiff: published.length === 0 ? null : Math.round((totalDiff / published.length) * 10) / 10,
    perDimension: DIMENSION_NAMES.map((name) => {
      const stats = perDimension.get(name) ?? { pairs: 0, exact: 0 };
      return { name, exactRate: rate(stats.exact, stats.pairs) };
    }),
  };
}

export async function getUsageReport(): Promise<{ problems: ProblemUsage[]; agreement: Agreement }> {
  const problems = await getDb().problem.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      title: true,
      attempts: {
        select: {
          status: true,
          messages: { select: { role: true, content: true, inputTokens: true, outputTokens: true } },
          grades: { select: { status: true, resultJson: true, auditLogs: { orderBy: { createdAt: "asc" }, select: { action: true, detailJson: true } } } },
        },
      },
    },
  });

  const published: { result: StoredGrade; audit: AuditEntry[] }[] = [];
  const rows = problems.map((problem) => {
    let studentTurns = 0;
    let assistantInput = 0;
    let assistantOutput = 0;
    let graderInput = 0;
    let graderOutput = 0;
    let safeFallbacks = 0;
    for (const attempt of problem.attempts) {
      for (const message of attempt.messages) {
        if (message.role === "STUDENT") studentTurns += 1;
        assistantInput += message.inputTokens ?? 0;
        assistantOutput += message.outputTokens ?? 0;
        if (message.role === "ASSISTANT" && message.content === SAFE_FALLBACK_REPLY) safeFallbacks += 1;
      }
      for (const grade of attempt.grades) {
        for (const entry of grade.auditLogs) {
          if (entry.action === "ai_graded" || entry.action === "ai_failed") {
            const tokens = tokensOf(entry.detailJson);
            graderInput += tokens.input;
            graderOutput += tokens.output;
          }
        }
        if (grade.status === "PUBLISHED" && grade.resultJson) {
          published.push({ result: grade.resultJson as unknown as StoredGrade, audit: grade.auditLogs });
        }
      }
    }
    const started = problem.attempts.length;
    const costUsd = estimateCostUsd(assistantInput + graderInput, assistantOutput + graderOutput);
    return {
      title: problem.title,
      started,
      finished: problem.attempts.filter((attempt) => attempt.status !== "IN_PROGRESS").length,
      studentTurns,
      avgTurns: started === 0 ? 0 : Math.round((studentTurns / started) * 10) / 10,
      assistantInput,
      assistantOutput,
      graderInput,
      graderOutput,
      costUsd,
      costPerAttemptUsd: started === 0 ? 0 : costUsd / started,
      safeFallbacks,
    };
  });
  return { problems: rows, agreement: computeAgreement(published) };
}
