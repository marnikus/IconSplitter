// regenprefs.ts — validated local preference for icons per SVG regeneration request.
// Stored separately from first-generation batch size and AI image-edit batch count.

import { readKey, writeKey } from "../state/safestorage";

export const REGEN_BATCH_PREF_KEY = "iconSplitter.svg.regenBatch.v1";
export const DEFAULT_REGEN_BATCH = 4;
export const MAX_REGEN_BATCH = 9;

export interface RegenBatchPref {
  count: number;
  warning: boolean;
}

export function parseRegenBatchPref(raw: unknown): number | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as { v?: unknown; count?: unknown };
  if (value.v !== 1 || !Number.isInteger(value.count)) return null;
  const count = value.count as number;
  return count >= 1 && count <= MAX_REGEN_BATCH ? count : null;
}

export function loadRegenBatchPref(): RegenBatchPref {
  const text = readKey(REGEN_BATCH_PREF_KEY);
  if (text === null) return { count: DEFAULT_REGEN_BATCH, warning: false };
  try {
    const count = parseRegenBatchPref(JSON.parse(text));
    return count === null ? { count: DEFAULT_REGEN_BATCH, warning: true } : { count, warning: false };
  } catch {
    return { count: DEFAULT_REGEN_BATCH, warning: true };
  }
}

export function saveRegenBatchPref(count: number): void {
  if (Number.isInteger(count) && count >= 1 && count <= MAX_REGEN_BATCH) {
    writeKey(REGEN_BATCH_PREF_KEY, JSON.stringify({ v: 1, count }));
  }
}
