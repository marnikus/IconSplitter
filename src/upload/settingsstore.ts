// settingsstore.ts — local persistence for the "SVG to upload" settings domain
// (design §4.1, RULE 6/13). Owns BOTH halves of the settings state: the global
// defaults every icon inherits and the per-icon overrides map (pair id →
// Overrides). One storage key, one writer pair, validated on read by the lib
// parsers — a corrupt or hand-edited payload costs one ignored load and the
// documented defaults, never a broken tab. Undo's persist-only path
// (uploadundo) writes through the same two functions, so a mounted panel and
// an unmounted undo can never leave two maps that disagree.

import { isRecord } from "../lib/isrecord";
import {
  normalizeSettings, parseOverrides, type SettingsOverrides, type UploadSettings,
} from "../lib/upload/settings";
import { readKey, writeKey } from "../state/safestorage";

const KEY = "iconSplitter.upload.settings.v1";
const VERSION = 1;

/** pair id → the fields that icon pins (absent = inherited from the defaults). */
export type OverridesMap = Record<string, SettingsOverrides>;

export interface UploadSettingsState {
  defaults: UploadSettings;
  overrides: OverridesMap;
}

/** A stored payload → validated state; one bad field costs one default (RULE 13). */
export function parseUploadSettingsState(raw: unknown): UploadSettingsState {
  if (!isRecord(raw) || raw.v !== VERSION) return { defaults: normalizeSettings(null), overrides: {} };
  return { defaults: normalizeSettings(raw.defaults), overrides: parseOverridesMap(raw.overrides) };
}

function parseOverridesMap(raw: unknown): OverridesMap {
  if (!isRecord(raw)) return {};
  const out: OverridesMap = {};
  for (const [id, value] of Object.entries(raw)) {
    if (typeof id !== "string" || id === "") continue;
    const parsed = parseOverrides(value);
    if (Object.keys(parsed).length > 0) out[id] = parsed;
  }
  return out;
}

export function loadUploadSettings(): UploadSettingsState {
  const text = readKey(KEY);
  if (!text) return parseUploadSettingsState(null);
  try {
    return parseUploadSettingsState(JSON.parse(text));
  } catch {
    return parseUploadSettingsState(null);
  }
}

export function saveUploadSettings(state: UploadSettingsState): void {
  writeKey(KEY, JSON.stringify({ v: VERSION, defaults: state.defaults, overrides: state.overrides }));
}

/** The overrides map alone — the undo path's persist-only writer needs just this. */
export function loadOverrides(): OverridesMap {
  return loadUploadSettings().overrides;
}

export function saveOverrides(overrides: OverridesMap): void {
  saveUploadSettings({ ...loadUploadSettings(), overrides });
}
