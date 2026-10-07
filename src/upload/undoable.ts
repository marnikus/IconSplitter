// undoable.ts — the SVG-to-upload tab's cross-tab undo path (RULE 12). "Apply
// settings to selected" writes per-icon overrides in ONE history entry
// (`uploadSettings`) showing the affected count; undo restores the previous
// overrides for every icon the entry touched. A mounted upload panel binds
// itself here first, so a click and an undo both land in the same code path;
// with no panel mounted the overrides map in localStorage is the durable
// fallback (the panel re-reads it on mount).

import { sanitizeOverride, type ExportOverride } from "../lib/upsettings";
import { loadUploadOverrides, saveUploadOverrides } from "./stores";
import type { UploadAction } from "./statemodel";

/** The per-id override map an entry carries; null = "no override existed". */
export interface UploadSettingsPatch {
  overrides: Record<string, ExportOverride | null>;
}

export type UploadSettingsApplier = (patch: UploadSettingsPatch) => boolean;

let live: UploadSettingsApplier | null = null;

/** A mounted upload panel claims the apply path; unmount releases it. */
export function bindUploadSettingsApplier(apply: UploadSettingsApplier): () => void {
  live = apply;
  return () => {
    if (live === apply) live = null;
  };
}

/** Apply an overrides patch: the live panel, else the durable store. */
export function applyUploadSettings(value: unknown): boolean {
  const patch = toPatch(value);
  if (patch === null) return false;
  if (live !== null) return live(patch);
  writeThrough(patch);
  return true;
}

/** Refuses a payload that is not a per-id override map (RULE 13). */
export function toPatch(value: unknown): UploadSettingsPatch | null {
  if (!isRecord(value) || !isRecord(value.overrides)) return null;
  const out: Record<string, ExportOverride | null> = {};
  let usable = false;
  for (const [id, raw] of Object.entries(value.overrides)) {
    if (raw === null) {
      out[id] = null;
      usable = true;
    } else {
      const clean = sanitizeOverride(raw);
      if (clean !== null) {
        out[id] = clean;
        usable = true;
      }
    }
  }
  return usable ? { overrides: out } : null;
}

/** The no-panel fallback: merge into the stored overrides and persist. */
function writeThrough(patch: UploadSettingsPatch): void {
  const stored = loadUploadOverrides(); // tolerant on read (RULE 13)
  for (const [id, override] of Object.entries(patch.overrides)) {
    if (override === null) delete stored[id];
    else stored[id] = override;
  }
  saveUploadOverrides(stored);
}

/** The reducer action a live panel dispatches for the same patch. */
export function setOverridesAction(patch: UploadSettingsPatch): UploadAction {
  return { type: "set-overrides", overrides: patch.overrides };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
