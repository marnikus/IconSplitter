// shadowselection.ts — checked icons' shadow state for Export settings and the EPS warning.
import { rowSettings, type AppliedMap } from "../lib/upload/decorations";
import type { SettingsOverrides, UploadSettings } from "../lib/upload/settings";

export interface SelectedShadow {
  state: "none" | "mixed" | "all";
  width: number | null;
  gap: number | null;
  epsVectorCount: number;
}

export function selectedShadow(
  ids: string[], defaults: UploadSettings, overrides: Record<string, SettingsOverrides>, applied: AppliedMap,
): SelectedShadow {
  if (ids.length === 0) return { state: "none", width: defaults.shadowWidthPct, gap: defaults.shadowGapPct, epsVectorCount: 0 };
  const settings = ids.map((id) => rowSettings(defaults, id, overrides, applied));
  const active = settings.filter((s) => s.shadowEnabled);
  const enabled = active.length;
  const width = active.length === 0 ? defaults.shadowWidthPct
    : active.every((s) => s.shadowWidthPct === active[0].shadowWidthPct) ? active[0].shadowWidthPct : null;
  const gap = active.length === 0 ? defaults.shadowGapPct
    : active.every((s) => s.shadowGapPct === active[0].shadowGapPct) ? active[0].shadowGapPct : null;
  const epsVectorCount = active.filter((s) => s.includeEps && s.epsConverter === "builtin").length;
  return { state: enabled === 0 ? "none" : enabled === ids.length ? "all" : "mixed", width, gap, epsVectorCount };
}
