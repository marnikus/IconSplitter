// settingsstore.ts — where the upload settings live between sessions (design §5).
// One key, one validated payload, one module-scope store: the panel binds it
// with useSyncExternalStore (RULE 12), so an undo pressed anywhere sees the same
// object. Persistence goes through state/safestorage, the same guarded
// read/write the other prefs use — a broken stored value loads as defaults, never
// as a crash (parseUploadSettings owns that decision).

import { isRecord } from "../lib/isrecord";
import { parseUploadSettings, type UploadSettings } from "../lib/svgupload/settings";
import { readKey, writeKey } from "../state/safestorage";

export const UPLOAD_SETTINGS_KEY = "iconSplitter.upload.settings.v1";

export function loadUploadSettings(): UploadSettings {
  const text = readKey(UPLOAD_SETTINGS_KEY);
  if (!text) return parseUploadSettings(null);
  try {
    return parseUploadSettings(JSON.parse(text));
  } catch {
    return parseUploadSettings(null);
  }
}

export function saveUploadSettings(settings: UploadSettings): void {
  writeKey(UPLOAD_SETTINGS_KEY, JSON.stringify(settings));
}

/** Installs a settings payload coming from undo/redo; junk is refused whole. */
export function restoreUploadSettings(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.defaults) || !isRecord(value.overrides)) return false;
  setUploadSettings(parseUploadSettings(value));
  return true;
}

// --- the in-memory store the panel binds (React-free on purpose) -------------
let current: UploadSettings | null = null;
const listeners = new Set<() => void>();

export function getUploadSettings(): UploadSettings {
  current ??= loadUploadSettings();
  return current;
}

export function setUploadSettings(next: UploadSettings): void {
  current = next;
  saveUploadSettings(next);
  for (const notify of listeners) notify();
}

export function subscribeUploadSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test seam: forget the cached value so the next read hits storage again. */
export function resetUploadSettingsCache(): void {
  current = null;
}
