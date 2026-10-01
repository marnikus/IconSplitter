// prefsstore.ts — the single read/write path for SVG preferences (RULE 13/24).
// The snapshot is non-secret and local; subscribers keep visible controls in sync.

import { readKey, writeKey } from "../state/safestorage";
import { parseSvgPreferences, type SvgPreferences } from "./prefs";

export const SVG_PREFS_KEY = "iconSplitter.svg.preferences.v1";
const listeners = new Set<() => void>();
let current = readCurrent();

export function getSvgPreferences(): SvgPreferences {
  return current;
}

export function setSvgPreferences(next: SvgPreferences): void {
  current = parseSvgPreferences(next);
  writeKey(SVG_PREFS_KEY, JSON.stringify(current));
  for (const listener of listeners) listener();
}

export function subscribeSvgPreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function reloadSvgPreferences(): SvgPreferences {
  current = readCurrent();
  return current;
}

function readCurrent(): SvgPreferences {
  const raw = readKey(SVG_PREFS_KEY);
  if (!raw) return parseSvgPreferences(null);
  try {
    return parseSvgPreferences(JSON.parse(raw));
  } catch {
    return parseSvgPreferences(null);
  }
}
