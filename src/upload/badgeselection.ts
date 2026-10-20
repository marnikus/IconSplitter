// badgeselection.ts — checked icons' independent badge state in Export settings.
import { effectiveSettings, type BadgeCorner, type SettingsOverrides, type UploadSettings } from "../lib/upload/settings";

export interface SelectedBadge {
  state: "none" | "mixed" | "all";
  width: number | null;
  corner: BadgeCorner | null;
  offsetX: number | null;
  offsetY: number | null;
}

/** Unchecked/hidden rows never determine the selected-only control values. */
export function selectedBadge(ids: string[], defaults: UploadSettings, overrides: Record<string, SettingsOverrides>): SelectedBadge {
  const enabled = ids.map((id) => effectiveSettings(defaults, overrides[id] ?? {})).filter((s) => s.badgeEnabled);
  const first = enabled[0] ?? defaults;
  const same = <K extends "badgeWidthPct" | "badgeCorner" | "badgeOffsetXPct" | "badgeOffsetYPct">(key: K) =>
    enabled.every((s) => s[key] === first[key]) ? first[key] : null;
  return {
    state: enabled.length === 0 ? "none" : enabled.length === ids.length ? "all" : "mixed",
    width: same("badgeWidthPct"), corner: same("badgeCorner"),
    offsetX: same("badgeOffsetXPct"), offsetY: same("badgeOffsetYPct"),
  };
}
