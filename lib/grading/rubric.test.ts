import { describe, expect, it } from "vitest";
import { applyIncompleteRule, computeTotal, DIMENSION_NAMES, DIMENSIONS, toStoredGrade, validateGradeResult } from "./rubric";

const valid = (level = 3) => ({
  dimensions: DIMENSION_NAMES.map((name) => ({ name, level, evidence: ["第 1 輪：「輸入是 n」"], comment: "不錯" })),
  feedback_to_student: "做得好。",
  confidence: "高",
  flags: [],
});

describe("computeTotal", () => {
  it("weights add up to 100", () => {
    expect(DIMENSIONS.reduce((sum, item) => sum + item.weight, 0)).toBe(100);
  });

  it("scores level ÷ 4 × weight", () => {
    expect(computeTotal(DIMENSION_NAMES.map((name) => ({ name, level: 3 })))).toBe(75);
    expect(computeTotal(DIMENSION_NAMES.map((name) => ({ name, level: 4 })))).toBe(100);
    expect(computeTotal(DIMENSION_NAMES.map((name) => ({ name, level: 1 })))).toBe(25);
    // 20×1 + 20×0.75 + 25×0.5 + 20×1 + 15×0.25 = 71.25 → 71.3
    expect(
      computeTotal([
        { name: "題目理解", level: 4 },
        { name: "找尋解答語法", level: 3 },
        { name: "組合解題邏輯", level: 2 },
        { name: "語法理解", level: 4 },
        { name: "學習反饋", level: 1 },
      ]),
    ).toBe(71.3);
  });
});

describe("validateGradeResult", () => {
  it("accepts a complete result and orders it like the rubric", () => {
    const shuffled = valid();
    shuffled.dimensions.reverse();
    const checked = validateGradeResult(shuffled);
    expect(checked.ok).toBe(true);
    if (checked.ok) expect(checked.result.dimensions.map((item) => item.name)).toEqual(DIMENSION_NAMES);
  });

  it("rejects missing evidence, bad levels, duplicates and missing fields", () => {
    const noEvidence = valid();
    noEvidence.dimensions[0].evidence = ["  "];
    expect(validateGradeResult(noEvidence)).toMatchObject({ ok: false, errors: ["題目理解: needs evidence"] });

    const badLevel = valid();
    badLevel.dimensions[1].level = 5;
    expect(validateGradeResult(badLevel).ok).toBe(false);

    const duplicate = valid();
    duplicate.dimensions[4] = { ...duplicate.dimensions[0] };
    expect(validateGradeResult(duplicate).ok).toBe(false);

    expect(validateGradeResult({ ...valid(), confidence: "很高" }).ok).toBe(false);
    expect(validateGradeResult({ ...valid(), feedback_to_student: "" }).ok).toBe(false);
    expect(validateGradeResult(null).ok).toBe(false);
  });
});

describe("incomplete attempts", () => {
  it("score 1 on reflection and keep the rest", () => {
    const checked = validateGradeResult(valid(4));
    if (!checked.ok) throw new Error("expected valid");
    const stored = toStoredGrade(applyIncompleteRule(checked.result));
    expect(stored.dimensions.find((item) => item.name === "學習反饋")?.level).toBe(1);
    expect(stored.dimensions.find((item) => item.name === "題目理解")?.level).toBe(4);
    expect(stored.total).toBe(88.8);
  });
});
