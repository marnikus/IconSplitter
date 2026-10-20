// regenprefs.ts — the stored "icons per regeneration request" (2026-10-20,
// RULE 13). Its own key, independent of the generation size and of the
// image-edit count: a regeneration request carries one SVG code per icon, so it
// is sized on its own. Parsing and clamping live in lib/svgregen.

import { isRecord } from "../lib/isrecord";
import { DEFAULT_REGEN_BATCH, clampRegenPerRequest, parseRegenBatch, serializeRegenBatch } from "../lib/svgregen";
import { readKey, writeKey } from "../state/safestorage";

export const REGEN_BATCH_KEY = "iconSplitter.svg.regenBatch.v1";

export interface RegenBatchLoad {
  count: number;
  /** The stored value was unreadable: the default is in use and the popup says so. */
  warning: boolean;
}

export function loadRegenBatchPref(): RegenBatchLoad {
  const text = readKey(REGEN_BATCH_KEY);
  if (text === null) return { count: DEFAULT_REGEN_BATCH.count, warning: false };
  const raw = safeJson(text);
  const readable = isRecord(raw) && typeof raw.count === "number";
  return { count: parseRegenBatch(raw).count, warning: !readable };
}

export function saveRegenBatchPref(count: number): void {
  writeKey(REGEN_BATCH_KEY, serializeRegenBatch({ count: clampRegenPerRequest(count) }));
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
