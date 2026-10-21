// settingsgestures.ts — which settings changes are DISCRETE (one undo entry
// per gesture) rather than drag-coalesced. Owned here so the per-icon override
// action stays one comparison and every decoration lists its fields once.
import { SIZE_GUIDE_FIELDS } from "../lib/upload/settingssizeguide";
import type { SettingsOverrides, UploadSettings } from "../lib/upload/settings";

const ENDPOINT_FIELDS: (keyof UploadSettings)[] = ["strokeLinecap"];
const SHADOW_FIELDS: (keyof UploadSettings)[] = ["shadowEnabled", "shadowWidthPct", "shadowGapPct"];
const BADGE_FIELDS: (keyof UploadSettings)[] = [
  "badgeEnabled", "badgeCorner", "badgeWidthPct", "badgeOffsetXPct", "badgeOffsetYPct",
];

/** Decoration toggles and committed numbers get one undo entry; other drags still coalesce. */
export function discreteSettingsChange(before: SettingsOverrides | null, after: SettingsOverrides | null): boolean {
  return [ENDPOINT_FIELDS, SHADOW_FIELDS, BADGE_FIELDS, SIZE_GUIDE_FIELDS].some((fields) => differs(fields, before, after));
}

function differs(fields: (keyof UploadSettings)[], before: SettingsOverrides | null, after: SettingsOverrides | null): boolean {
  return fields.some((field) => before?.[field] !== after?.[field]);
}
