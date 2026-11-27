import { describe, expect, it } from "vitest";
import { LARGE_INSERT_CHARS, MAX_CODE_CHARS, clampEditTime, isFlaggedEdit, parseAutosavePayload } from "./edit-history";

describe("isFlaggedEdit", () => {
  it("flags only large insertions made by typing or input, not undo/redo", () => {
    expect(isFlaggedEdit({ inserted: LARGE_INSERT_CHARS, kind: "edit" })).toBe(false);
    expect(isFlaggedEdit({ inserted: LARGE_INSERT_CHARS + 1, kind: "edit" })).toBe(true);
    expect(isFlaggedEdit({ inserted: 500, kind: "undo" })).toBe(false);
    expect(isFlaggedEdit({ inserted: 500, kind: "redo" })).toBe(false);
  });
});

describe("parseAutosavePayload", () => {
  const edit = { at: 1_700_000_000_000, inserted: 1, deleted: 0, kind: "edit" };

  it("accepts a well-formed body", () => {
    expect(parseAutosavePayload({ code: "n = 1", edits: [edit] })).toEqual({ code: "n = 1", edits: [edit] });
    expect(parseAutosavePayload({ code: "", edits: [] })).toEqual({ code: "", edits: [] });
  });

  it("rejects malformed bodies", () => {
    expect(parseAutosavePayload(null)).toBeNull();
    expect(parseAutosavePayload({ code: 1, edits: [] })).toBeNull();
    expect(parseAutosavePayload({ code: "x" })).toBeNull();
    expect(parseAutosavePayload({ code: "x", edits: [{ ...edit, inserted: -1 }] })).toBeNull();
    expect(parseAutosavePayload({ code: "x", edits: [{ ...edit, inserted: 1.5 }] })).toBeNull();
    expect(parseAutosavePayload({ code: "x", edits: [{ ...edit, kind: "paste" }] })).toBeNull();
    expect(parseAutosavePayload({ code: "x", edits: [{ ...edit, at: "now" }] })).toBeNull();
  });

  it("rejects oversized code or edit batches", () => {
    expect(parseAutosavePayload({ code: "x".repeat(MAX_CODE_CHARS + 1), edits: [] })).toBeNull();
    expect(parseAutosavePayload({ code: "x", edits: Array.from({ length: 1001 }, () => edit) })).toBeNull();
  });
});

describe("clampEditTime", () => {
  const now = Date.UTC(2026, 10, 27, 12);
  it("keeps plausible times and clamps the rest", () => {
    expect(clampEditTime(now - 1000, now).getTime()).toBe(now - 1000);
    expect(clampEditTime(now + 60_000, now).getTime()).toBe(now);
    expect(clampEditTime(0, now).getTime()).toBe(now - 24 * 60 * 60 * 1000);
  });
});
