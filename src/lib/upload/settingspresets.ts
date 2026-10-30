// Named reusable GLOBAL export defaults, not per-row pins or checked decorations.
import { isRecord } from "../isrecord";
import { normalizeSettings, type UploadSettings } from "./settings";

export const EXPORT_PRESET_LIMIT = 50;
const NAME_LIMIT = 60;
export interface ExportSettingsPreset { name: string; settings: UploadSettings }
export interface PresetChange { presets: ExportSettingsPreset[]; selected: string; error: string | null }

/** Bad entries are isolated; the last case-insensitive name wins, bounded at50. */
export function parseExportPresets(raw: unknown): ExportSettingsPreset[] {
  if (!isRecord(raw) || raw.v !== 1 || !Array.isArray(raw.presets)) return [];
  const presets = new Map<string, ExportSettingsPreset>();
  for (const entry of raw.presets) {
    if (!isRecord(entry) || typeof entry.name !== "string" || !isRecord(entry.settings)) continue;
    const name = entry.name.trim();
    if (name === "" || name.length > NAME_LIMIT) continue;
    const key = name.toLocaleLowerCase("en");
    presets.delete(key);
    presets.set(key, { name, settings: normalizeSettings(entry.settings) });
  }
  return [...presets.values()].slice(-EXPORT_PRESET_LIMIT);
}

/** Save is deliberately create-only: duplicate names can never overwrite settings. */
export function createExportPreset(presets: readonly ExportSettingsPreset[], rawName: string, settings: UploadSettings): PresetChange {
  const name = rawName.trim();
  const error = nameError(presets, name) ?? (presets.length >= EXPORT_PRESET_LIMIT ? "At most 50 export presets can be saved" : null);
  if (error !== null) return { presets: [...presets], selected: "", error };
  return { presets: [...presets, { name, settings: normalizeSettings(settings) }], selected: name, error: null };
}

export function renameExportPreset(presets: readonly ExportSettingsPreset[], previous: string, rawName: string): PresetChange {
  const name = rawName.trim();
  const error = nameError(presets, name, previous);
  if (error !== null) return { presets: [...presets], selected: previous, error };
  if (!presets.some((p) => p.name === previous)) return missingPreset(presets);
  return { presets: presets.map((p) => p.name === previous ? { ...p, name } : p), selected: name, error: null };
}

export function removeExportPreset(presets: readonly ExportSettingsPreset[], name: string): PresetChange {
  if (!presets.some((p) => p.name === name)) return missingPreset(presets);
  return { presets: presets.filter((p) => p.name !== name), selected: "", error: null };
}

function nameError(presets: readonly ExportSettingsPreset[], name: string, except = ""): string | null {
  if (name === "" || name.length > NAME_LIMIT) return "Enter a preset name of 1–60 characters";
  const duplicate = presets.some((p) => p.name !== except && p.name.toLocaleLowerCase("en") === name.toLocaleLowerCase("en"));
  return duplicate ? "A preset with that name already exists — choose another name" : null;
}

function missingPreset(presets: readonly ExportSettingsPreset[]): PresetChange {
  return { presets: [...presets], selected: "", error: "Select an existing export preset first" };
}
