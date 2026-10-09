// regenstore.ts — local persistence for "Regenerate SVG from" (2026-10-09,
// RULE 13). Owns the one key and the edge read: the stored choice is resolved
// against the saved prompt presets here, so lib/svgregen stays pure. A corrupt
// payload costs one ignored load and the main-prompt default.

import { DEFAULT_REGEN, parseRegen, regenPlanOf, serializeRegen, type RegenResult, type RegenSetting } from "../lib/svgregen";
import { readKey, writeKey } from "../state/safestorage";
import { loadPresets } from "../upload/promptstore";

const KEY = "iconSplitter.svg.regen.v1";

export function loadRegenSetting(): RegenSetting {
  const text = readKey(KEY);
  if (!text) return DEFAULT_REGEN;
  try {
    return parseRegen(JSON.parse(text));
  } catch {
    return DEFAULT_REGEN;
  }
}

export function saveRegenSetting(setting: RegenSetting): void {
  writeKey(KEY, serializeRegen(setting));
}

/** The plan the next run gets, or the named reason it cannot start. */
export function resolveRegen(): RegenResult {
  return regenPlanOf(loadRegenSetting(), loadPresets());
}
