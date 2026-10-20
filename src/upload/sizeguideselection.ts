// sizeguideselection.ts — checked icons' independent S/L size-guide state in Export settings.
import { effectiveSettings, type SettingsOverrides, type UploadSettings } from "../lib/upload/settings";

export interface SelectedSizeGuide { state: "none" | "mixed" | "all" }

/** Unchecked/hidden rows never determine the selected-only checkbox state. */
export function selectedSizeGuide(ids: string[], defaults: UploadSettings, overrides: Record<string, SettingsOverrides>): SelectedSizeGuide {
  const on = ids.filter((id) => effectiveSettings(defaults, overrides[id] ?? {}).sizeGuideEnabled).length;
  return { state: on === 0 ? "none" : on === ids.length ? "all" : "mixed" };
}
