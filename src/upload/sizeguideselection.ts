// sizeguideselection.ts — checked icons' independent S/L size-guide state in Export settings.
import { rowSettings, type AppliedMap } from "../lib/upload/decorations";
import type { SettingsOverrides, UploadSettings } from "../lib/upload/settings";

export interface SelectedSizeGuide { state: "none" | "mixed" | "all" }

/** Unchecked/hidden rows never determine the selected-only checkbox state. */
export function selectedSizeGuide(
  ids: string[], defaults: UploadSettings, overrides: Record<string, SettingsOverrides>, applied: AppliedMap,
): SelectedSizeGuide {
  const on = ids.filter((id) => rowSettings(defaults, id, overrides, applied).sizeGuideEnabled).length;
  return { state: on === 0 ? "none" : on === ids.length ? "all" : "mixed" };
}
