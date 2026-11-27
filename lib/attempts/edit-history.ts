/** A single insertion longer than this (outside undo/redo) is flagged for the teacher. */
export const LARGE_INSERT_CHARS = 30;
export const MAX_CODE_CHARS = 50_000;
export const MAX_EDITS_PER_SAVE = 1_000;

export type EditKind = "edit" | "undo" | "redo";

export interface EditSample {
  /** Client time in ms since epoch. */
  at: number;
  inserted: number;
  deleted: number;
  kind: EditKind;
}

export interface AutosavePayload {
  code: string;
  edits: EditSample[];
}

export function isFlaggedEdit(edit: Pick<EditSample, "inserted" | "kind">): boolean {
  return edit.kind === "edit" && edit.inserted > LARGE_INSERT_CHARS;
}

const isCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;

function parseEdit(value: unknown): EditSample | null {
  if (typeof value !== "object" || value === null) return null;
  const { at, inserted, deleted, kind } = value as Record<string, unknown>;
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  if (!isCount(inserted) || !isCount(deleted)) return null;
  if (kind !== "edit" && kind !== "undo" && kind !== "redo") return null;
  return { at, inserted, deleted, kind };
}

/** Validates an untrusted autosave request body. Returns null when it is malformed or too large. */
export function parseAutosavePayload(body: unknown): AutosavePayload | null {
  if (typeof body !== "object" || body === null) return null;
  const { code, edits } = body as Record<string, unknown>;
  if (typeof code !== "string" || code.length > MAX_CODE_CHARS) return null;
  if (!Array.isArray(edits) || edits.length > MAX_EDITS_PER_SAVE) return null;
  const parsed = edits.map(parseEdit);
  if (parsed.some((edit) => edit === null)) return null;
  return { code, edits: parsed as EditSample[] };
}

/** Client clocks drift; keep event times within the last day and never in the future. */
export function clampEditTime(at: number, now: number): Date {
  const dayMs = 24 * 60 * 60 * 1000;
  return new Date(Math.min(now, Math.max(now - dayMs, at)));
}
