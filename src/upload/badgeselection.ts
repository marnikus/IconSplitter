// badgeselection.ts — checked icons' independent badge state in Export settings.
import { effectiveSettings, type SettingsOverrides, type UploadSettings } from "../lib/upload/settings";

export interface SelectedBadge { state: "none" | "mixed" | "all" }

/** Unchecked/hidden rows never determine the selected-only checkbox state. */
export function selectedBadge(ids: string[], defaults: UploadSettings, overrides: Record<string, SettingsOverrides>): SelectedBadge {
  const on = ids.filter((id) => effectiveSettings(defaults, overrides[id] ?? {}).badgeEnabled).length;
  return { state: on === 0 ? "none" : on === ids.length ? "all" : "mixed" };
}
