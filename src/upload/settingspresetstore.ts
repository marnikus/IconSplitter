// Device-local catalog, separate from active defaults and undoable row overrides.
import { parseExportPresets, type ExportSettingsPreset } from "../lib/upload/settingspresets";
import { readKey, writeKey } from "../state/safestorage";

export const EXPORT_PRESETS_KEY = "iconSplitter.upload.exportPresets.v1";

export function loadExportPresets(): ExportSettingsPreset[] {
  const text = readKey(EXPORT_PRESETS_KEY);
  if (text === null) return [];
  try {
    return parseExportPresets(JSON.parse(text));
  } catch {
    return [];
  }
}

/** Verify persistence: quota/private-mode failure must not be reported as saved. */
export function saveExportPresets(presets: readonly ExportSettingsPreset[]): boolean {
  const text = JSON.stringify({ v: 1, presets: parseExportPresets({ v: 1, presets }) });
  writeKey(EXPORT_PRESETS_KEY, text);
  return readKey(EXPORT_PRESETS_KEY) === text;
}
