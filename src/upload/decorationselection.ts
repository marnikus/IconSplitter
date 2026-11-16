// Resolve each checked icon once, then share its effective values between the
// three independent selected-decoration controls. Hidden checks still count.
import { rowSettings, type AppliedMap } from "../lib/upload/decorations";
import type { SettingsOverrides, UploadSettings } from "../lib/upload/settings";
import { shadowSelectionOf } from "./shadowselection";

export function enabledSelection(
  settings: readonly UploadSettings[], field: "badgeEnabled" | "sizeGuideEnabled",
): "none" | "mixed" | "all" {
  const on = settings.filter((s) => s[field]).length;
  return on === 0 ? "none" : on === settings.length ? "all" : "mixed";
}

export function selectedDecorations(
  ids: readonly string[], defaults: UploadSettings, overrides: Record<string, SettingsOverrides>, applied: AppliedMap,
) {
  const settings = ids.map((id) => rowSettings(defaults, id, overrides, applied));
  return {
    shadow: shadowSelectionOf(settings, defaults),
    badge: { state: enabledSelection(settings, "badgeEnabled") },
    sizeGuide: { state: enabledSelection(settings, "sizeGuideEnabled") },
  };
}
