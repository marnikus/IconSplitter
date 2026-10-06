// isrecord.ts — RULE 13: every persisted file is parsed defensively, and every
// parser starts with the same "is this even an object?" question.
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
