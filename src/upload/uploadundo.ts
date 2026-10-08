// uploadundo.ts — the upload-settings history entry's apply path (design §6,
// RULE 12). One entry type `uploadSettings` carries `{ overrides: { [pairId]:
// Overrides | null } }` before/after: "Apply settings to selected" pushes ONE
// entry for the whole selection, a per-icon override set/reset pushes one each.
// A mounted panel binds itself here first, so a click and an undo both land in
// the same code path (the panel's persist effect writes localStorage); with no
// panel mounted an undo writes the store directly, which the next mount reads.

import { overridesEqual, parseOverrides, type SettingsOverrides } from "../lib/upload/settings";
import { loadOverrides, saveOverrides, type OverridesMap } from "./settingsstore";

/** The payload one `uploadSettings` entry carries, on either side. */
export interface UploadSettingsPatch {
  overrides: Record<string, SettingsOverrides | null>;
}

export type UploadSettingsApplier = (patch: UploadSettingsPatch) => void;

let live: UploadSettingsApplier | null = null;

/** A mounted upload panel claims the apply path; unmount releases it. */
export function bindUploadSettingsApplier(apply: UploadSettingsApplier): () => void {
  live = apply;
  return () => {
    if (live === apply) live = null;
  };
}

/**
 * Apply a settings patch. False means "nothing changed" — never a partial
 * write — so the history cursor only moves on a real change.
 */
export function applyUploadSettingsPatch(patch: UploadSettingsPatch): boolean {
  if (live) {
    live(patch);
    return true;
  }
  return persistOverrides(patch.overrides);
}

/** Unmounted: write the store directly; the next mount reads it back. */
function persistOverrides(overrides: Record<string, SettingsOverrides | null>): boolean {
  const next: OverridesMap = { ...loadOverrides() };
  let changed = false;
  for (const [id, value] of Object.entries(overrides)) {
    changed = applyOne(next, id, value) || changed;
  }
  if (!changed) return false;
  saveOverrides(next);
  return true;
}

function applyOne(map: OverridesMap, id: string, value: SettingsOverrides | null): boolean {
  const current = map[id];
  if (value === null || Object.keys(value).length === 0) {
    if (current === undefined) return false;
    delete map[id];
    return true;
  }
  if (current !== undefined && overridesEqual(current, value)) return false;
  map[id] = value;
  return true;
}

/** Field-by-field equality over every overrideable setting (lib/upload/settings). */
export { overridesEqual };

/** A history payload → the patch, or null when it carries nothing usable. */
export function toUploadSettingsPatch(value: unknown): UploadSettingsPatch | null {
  if (!isOverridesRecord(value)) return null;
  const overrides: Record<string, SettingsOverrides | null> = {};
  for (const [id, raw] of Object.entries(value.overrides)) {
    if (raw === null) {
      overrides[id] = null;
      continue;
    }
    const parsed = parseOverrides(raw);
    if (Object.keys(parsed).length > 0) overrides[id] = parsed;
  }
  return Object.keys(overrides).length > 0 ? { overrides } : null;
}

function isOverridesRecord(value: unknown): value is { overrides: Record<string, unknown> } {
  return typeof value === "object" && value !== null
    && typeof (value as { overrides?: unknown }).overrides === "object"
    && (value as { overrides?: unknown }).overrides !== null;
}
