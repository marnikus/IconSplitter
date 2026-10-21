// uploadundo.ts — the upload-settings history entry's apply path (design §6,
// RULE 12). One entry type `uploadSettings` carries `{ overrides, applied }`
// before/after: the bulk bar's reset clears the whole selection in ONE entry
// (null = that row inherits again), a per-icon override set/reset pushes one
// each, and a decoration applied to the selection records its `applied` mark in
// the same entry (2026-10-21) so undo restores the "inherited" reading too.
// A mounted panel binds itself here first, so a click and an undo both land in
// the same code path (the panel's persist effect writes localStorage); with no
// panel mounted an undo writes the store directly, which the next mount reads.

import { appliedEqual, parseApplied, type AppliedDecorations, type AppliedMap } from "../lib/upload/decorations";
import { overridesEqual, parseOverrides, type SettingsOverrides } from "../lib/upload/settings";
import { loadOverrides, loadApplied, saveOverrides, type OverridesMap } from "./settingsstore";

/** The payload one `uploadSettings` entry carries, on either side. */
export interface UploadSettingsPatch {
  overrides: Record<string, SettingsOverrides | null>;
  applied?: Record<string, AppliedDecorations | null>;
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
  return persistMaps(patch);
}

/** Unmounted: write the store directly; the next mount reads it back. */
function persistMaps(patch: UploadSettingsPatch): boolean {
  const overrides: OverridesMap = { ...loadOverrides() };
  const applied: AppliedMap = { ...loadApplied() };
  let changed = false;
  for (const [id, value] of Object.entries(patch.overrides)) {
    changed = applyOne(overrides, id, value) || changed;
  }
  for (const [id, value] of Object.entries(patch.applied ?? {})) {
    changed = applyMarks(applied, id, value) || changed;
  }
  if (!changed) return false;
  saveOverrides(overrides, applied);
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

function applyMarks(map: AppliedMap, id: string, value: AppliedDecorations | null): boolean {
  const current = map[id];
  if (value === null || Object.keys(value).length === 0) {
    if (current === undefined) return false;
    delete map[id];
    return true;
  }
  if (current !== undefined && appliedEqual(current, value)) return false;
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
  const applied = parseAppliedPatch((value as { applied?: unknown }).applied);
  const carries = Object.keys(overrides).length > 0 || applied !== undefined;
  return carries ? { overrides, ...(applied === undefined ? {} : { applied }) } : null;
}

/** The `applied` half: validated marks, null = clear; undefined when nothing usable. */
function parseAppliedPatch(raw: unknown): Record<string, AppliedDecorations | null> | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const out: Record<string, AppliedDecorations | null> = {};
  for (const [id, value] of Object.entries(raw)) {
    const marks = value === null ? null : parseApplied(value);
    if (marks === null || Object.keys(marks).length > 0) out[id] = marks;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function isOverridesRecord(value: unknown): value is { overrides: Record<string, unknown> } {
  return typeof value === "object" && value !== null
    && typeof (value as { overrides?: unknown }).overrides === "object"
    && (value as { overrides?: unknown }).overrides !== null;
}
