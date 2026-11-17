// textcase.ts — banner text case (2026-11-15): as typed, Capitalized Words, or UPPER.
import type { TextCase } from "./types";

export function applyCase(text: string, mode: TextCase): string {
  if (mode === "upper") return text.toUpperCase();
  if (mode === "capitalized") return text.toLowerCase().replace(/(^|\s)(\S)/gu, (_m, space: string, c: string) => space + c.toUpperCase());
  return text;
}
