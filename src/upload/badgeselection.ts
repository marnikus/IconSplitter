// badgeselection.ts — checked icons' independent badge state in Export settings.
import { rowSettings, type AppliedMap } from "../lib/upload/decorations";
import type { SettingsOverrides, UploadSettings } from "../lib/upload/settings";

export interface SelectedBadge { state: "none" | "mixed" | "all" }

/** Unchecked/hidden rows never determine the selected-only checkbox state. */
export function selectedBadge(
  ids: string[], defaults: UploadSettings, overrides: Record<string, SettingsOverrides>, applied: AppliedMap,
): SelectedBadge {
  const on = ids.filter((id) => rowSettings(defaults, id, overrides, applied).badgeEnabled).length;
  return { state: on === 0 ? "none" : on === ids.length ? "all" : "mixed" };
}
