// settingsstore.ts — local persistence for the "SVG to upload" settings domain
// (design §4.1, RULE 6/13). Owns the three maps the tab reads: the global
// defaults every icon inherits, the per-icon overrides (what that icon's own
// dialog pinned) and the decorations a global control applied to an icon. One
// storage key, one writer pair, validated on read by the lib parsers — a
// corrupt or hand-edited payload costs one ignored load and the documented
// defaults, never a broken tab. Undo's persist-only path (uploadundo) writes
// through the same functions, so a mounted panel and an unmounted undo can
// never leave maps that disagree. A decoration never lives in `overrides`
// (older payloads migrate on read, 2026-10-21).

import { isRecord } from "../lib/isrecord";
import { migrateOverrides, parseAppliedMap, type AppliedMap } from "../lib/upload/decorations";
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
  /** Decorations a global control applied — values, kept apart from the overrides (2026-10-21). */
  applied: AppliedMap;
}

/** What a writer may hand over; the applied decorations default to none. */
export interface UploadSettingsSave {
  defaults: UploadSettings;
  overrides: OverridesMap;
  applied?: AppliedMap;
}

/** A stored payload → validated state; one bad field costs one default (RULE 13). */
export function parseUploadSettingsState(raw: unknown): UploadSettingsState {
  if (!isRecord(raw) || raw.v !== VERSION) return { defaults: normalizeSettings(null), overrides: {}, applied: {} };
  // A payload written before this build has no `applied` key and stored decorations
  // as ordinary overrides: move them across once. A payload that HAS the key is
  // current — its overrides are the user's own dialog pins and must stay pinned.
  const overrides = parseOverridesMap(raw.overrides);
  const applied = parseAppliedMap(raw.applied);
  const migrated = "applied" in raw ? { overrides, applied } : migrateOverrides(overrides, applied);
  return {
    defaults: normalizeSettings(raw.defaults), overrides: migrated.overrides, applied: migrated.applied,
  };
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

export function saveUploadSettings(state: UploadSettingsSave): void {
  writeKey(KEY, JSON.stringify({
    v: VERSION, defaults: state.defaults, overrides: state.overrides, applied: state.applied ?? {},
  }));
}

/** The overrides map alone — the undo path's persist-only writer needs just this. */
export function loadOverrides(): OverridesMap {
  return loadUploadSettings().overrides;
}

/** The applied decorations alone — the row's effective settings read them. */
export function loadApplied(): AppliedMap {
  return loadUploadSettings().applied;
}

/** Both maps at once: the unmounted undo path must never write one without the other. */
export function saveOverrides(overrides: OverridesMap, applied: AppliedMap = loadApplied()): void {
  saveUploadSettings({ ...loadUploadSettings(), overrides, applied });
}
