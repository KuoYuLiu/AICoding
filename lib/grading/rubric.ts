/** The stage-0 rubric: five dimensions, four levels, weights add up to 100 (prompts/grader.md). */
export const DIMENSIONS = [
  { name: "題目理解", weight: 20 },
  { name: "找尋解答語法", weight: 20 },
  { name: "組合解題邏輯", weight: 25 },
  { name: "語法理解", weight: 20 },
  { name: "學習反饋", weight: 15 },
] as const;

export type DimensionName = (typeof DIMENSIONS)[number]["name"];
export const DIMENSION_NAMES = DIMENSIONS.map((dimension) => dimension.name) as DimensionName[];
export const REFLECTION_DIMENSION: DimensionName = "學習反饋";

export const LEVEL_LABELS: Record<number, string> = { 4: "優秀", 3: "良好", 2: "發展中", 1: "待加強" };
export const CONFIDENCE_VALUES = ["高", "中", "低"] as const;
export type Confidence = (typeof CONFIDENCE_VALUES)[number];

export interface DimensionResult {
  name: DimensionName;
  level: number;
  evidence: string[];
  comment: string;
}

/** What the AI grader returns (and what a teacher edits). The total is always computed, never trusted. */
export interface GradeResult {
  dimensions: DimensionResult[];
  feedback_to_student: string;
  confidence: Confidence;
  flags: string[];
}

/** Stored in Grade.resultJson. */
export interface StoredGrade extends GradeResult {
  total: number;
}

/** Each dimension scores level ÷ 4 × weight; the total is rounded to one decimal. */
export function computeTotal(dimensions: Pick<DimensionResult, "name" | "level">[]): number {
  const sum = DIMENSIONS.reduce((total, dimension) => {
    const level = dimensions.find((item) => item.name === dimension.name)?.level ?? 0;
    return total + (level / 4) * dimension.weight;
  }, 0);
  return Math.round(sum * 10) / 10;
}

const isLevel = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 4;
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");

/**
 * Checks a grader reply: every dimension exactly once, a level 1–4, at least one piece of evidence,
 * feedback and a confidence value. Returns the cleaned result in rubric order, or the reasons it failed.
 */
export function validateGradeResult(value: unknown): { ok: true; result: GradeResult } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) return { ok: false, errors: ["not an object"] };
  const raw = value as Record<string, unknown>;
  const dimensions = Array.isArray(raw.dimensions) ? (raw.dimensions as Record<string, unknown>[]) : [];
  if (!Array.isArray(raw.dimensions)) errors.push("dimensions missing");

  const cleaned: DimensionResult[] = [];
  for (const name of DIMENSION_NAMES) {
    const matches = dimensions.filter((item) => item?.name === name);
    if (matches.length !== 1) {
      errors.push(`${name}: expected once, got ${matches.length}`);
      continue;
    }
    const [item] = matches;
    if (!isLevel(item.level)) errors.push(`${name}: level must be 1–4`);
    const evidence = isStringArray(item.evidence) ? item.evidence.map((line) => line.trim()).filter(Boolean) : [];
    if (evidence.length === 0) errors.push(`${name}: needs evidence`);
    if (typeof item.comment !== "string") errors.push(`${name}: comment missing`);
    cleaned.push({ name, level: Number(item.level), evidence, comment: typeof item.comment === "string" ? item.comment.trim() : "" });
  }
  if (dimensions.length !== DIMENSION_NAMES.length) errors.push(`expected ${DIMENSION_NAMES.length} dimensions`);
  if (typeof raw.feedback_to_student !== "string" || !raw.feedback_to_student.trim()) errors.push("feedback_to_student missing");
  if (!CONFIDENCE_VALUES.includes(raw.confidence as Confidence)) errors.push("confidence must be 高, 中 or 低");
  if (raw.flags !== undefined && !isStringArray(raw.flags)) errors.push("flags must be strings");

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    result: {
      dimensions: cleaned,
      feedback_to_student: (raw.feedback_to_student as string).trim(),
      confidence: raw.confidence as Confidence,
      flags: isStringArray(raw.flags) ? raw.flags : [],
    },
  };
}

/** Incomplete attempts (tests not all passed) score 1 on reflection; the rest is graded as usual. */
export function applyIncompleteRule(result: GradeResult): GradeResult {
  return {
    ...result,
    dimensions: result.dimensions.map((dimension) =>
      dimension.name === REFLECTION_DIMENSION && dimension.level !== 1
        ? { ...dimension, level: 1, comment: `${dimension.comment}（未通過全部測資即結束作答，依規則記 1。）`.trim() }
        : dimension,
    ),
  };
}

export function toStoredGrade(result: GradeResult): StoredGrade {
  return { ...result, total: computeTotal(result.dimensions) };
}
