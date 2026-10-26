// shadowselection.ts — checked icons' shadow state for Export settings.
import { rowSettings, type AppliedMap } from "../lib/upload/decorations";
import type { SettingsOverrides, UploadSettings } from "../lib/upload/settings";

export interface SelectedShadow {
  state: "none" | "mixed" | "all";
  width: number | null;
  gap: number | null;
}

export function selectedShadow(
  ids: string[], defaults: UploadSettings, overrides: Record<string, SettingsOverrides>, applied: AppliedMap,
): SelectedShadow {
  return shadowSelectionOf(ids.map((id) => rowSettings(defaults, id, overrides, applied)), defaults);
}

/** Same summary for callers that already resolved all selected settings. */
export function shadowSelectionOf(settings: readonly UploadSettings[], defaults: UploadSettings): SelectedShadow {
  const active = settings.filter((s) => s.shadowEnabled);
  const enabled = active.length;
  const width = active.length === 0 ? defaults.shadowWidthPct
    : active.every((s) => s.shadowWidthPct === active[0].shadowWidthPct) ? active[0].shadowWidthPct : null;
  const gap = active.length === 0 ? defaults.shadowGapPct
    : active.every((s) => s.shadowGapPct === active[0].shadowGapPct) ? active[0].shadowGapPct : null;
  return { state: enabled === 0 ? "none" : enabled === settings.length ? "all" : "mixed", width, gap };
}
