import { describe, expect, it } from "vitest";
import { DIMENSION_NAMES, toStoredGrade } from "./rubric";
import { aiLevelsOf, computeAgreement, estimateCostUsd } from "./usage";

const grade = (level: number) =>
  toStoredGrade({
    dimensions: DIMENSION_NAMES.map((name) => ({ name, level, evidence: ["e"], comment: "" })),
    feedback_to_student: "f",
    confidence: "中",
    flags: [],
  });
const levels = (level: number) => Object.fromEntries(DIMENSION_NAMES.map((name) => [name, level]));

describe("estimateCostUsd", () => {
  it("uses Opus 5.5 list prices", () => {
    expect(estimateCostUsd(1_000_000, 0)).toBe(4);
    expect(estimateCostUsd(0, 1_000_000)).toBe(20);
    expect(estimateCostUsd(50_000, 2_000)).toBeCloseTo(0.24);
  });
});

describe("agreement", () => {
  it("takes the AI's levels from before the teacher's first edit", () => {
    const final = grade(4);
    const audit = [
      { action: "ai_graded", detailJson: {} },
      { action: "edited", detailJson: { before: { levels: levels(3), total: 75 }, after: { levels: levels(4), total: 100 } } },
      { action: "edited", detailJson: { before: { levels: levels(4), total: 100 }, after: { levels: levels(4), total: 100 } } },
    ];
    expect(aiLevelsOf(final, audit)).toEqual({ levels: levels(3), total: 75 });
    expect(aiLevelsOf(final, [{ action: "ai_graded", detailJson: {} }]).total).toBe(100);
  });

  it("reports exact, within-one and total differences", () => {
    const untouched = { result: grade(3), audit: [] };
    const edited = {
      result: toStoredGrade({ ...grade(3), dimensions: grade(3).dimensions.map((item, index) => (index === 0 ? { ...item, level: 1 } : item)) }),
      audit: [{ action: "edited", detailJson: { before: { levels: levels(3), total: 75 } } }],
    };
    const agreement = computeAgreement([untouched, edited]);
    expect(agreement.graded).toBe(2);
    expect(agreement.exactRate).toBe(9 / 10);
    expect(agreement.withinOneRate).toBe(9 / 10);
    expect(agreement.meanTotalDiff).toBe(5);
    expect(agreement.perDimension[0]).toEqual({ name: "題目理解", exactRate: 0.5 });
    expect(computeAgreement([]).exactRate).toBeNull();
  });
});
