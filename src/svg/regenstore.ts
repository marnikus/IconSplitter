// regenstore.ts — where the "regenerate from current SVG" option lives (design
// 2026-10-09, D2). The option is GENERATION behaviour, so it is not a field of
// the upload settings; the Export settings dialog merely edits it, and the run
// reads it when it starts. One key, parse/serialize owned by lib/regensvg, and
// a corrupt or hand-edited payload costs the default, never a guess (RULE 13).

import { parseRegenSettings, serializeRegenSettings, type RegenSettings } from "../lib/regensvg";
import { readKey, writeKey } from "../state/safestorage";

export const REGEN_KEY = "iconSplitter.svg.regen.v1";

export function loadRegenSettings(): RegenSettings {
  const text = readKey(REGEN_KEY);
  if (!text) return { enabled: false, preset: "" };
  try {
    return parseRegenSettings(JSON.parse(text));
  } catch {
    return { enabled: false, preset: "" };
  }
}

export function saveRegenSettings(settings: RegenSettings): void {
  writeKey(REGEN_KEY, serializeRegenSettings(settings));
}
