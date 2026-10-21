// decorations.ts — which settings a GLOBAL control wrote into an icon (2026-10-21,
// archive/2026-10-21-upload-applied-decorations).
//
// The values still live in the icon's settings overrides: the export, the
// preview, the fingerprint and the staleness check already read them there.
// But a field written by the Export settings popup (a Checked-icons decoration
// checkbox or a selected-only dimension) is not a local pin — it is an
// application from the selection, recorded here so the icon's dialog can say
// `inherited`, the row's pin count ignores it, and the global Reset never
// undoes it. Only a change made inside that icon's own dialog is a real pin.

import { isRecord } from "../isrecord";
import { SETTINGS_FIELDS, type SettingsOverrides, type UploadSettings } from "./settings";
import { SIZE_GUIDE_FIELDS } from "./settingssizeguide";

export const DECORATION_KEYS = ["shadow", "badge", "sizeGuide"] as const;
export type DecorationKey = (typeof DECORATION_KEYS)[number];

/** The settings field each decoration switches. */
export const DECORATION_FIELD = {
  shadow: "shadowEnabled", badge: "badgeEnabled", sizeGuide: "sizeGuideEnabled",
} as const;

/**
 * Every field a decoration owns — its enable flag and its geometry. A reset to
 * inherited never removes one of these: the decoration is a selection-level
 * choice with its own checkbox, not a general setting (2026-10-21).
 */
export const DECORATION_FIELDS: (keyof UploadSettings)[] = [
  "shadowEnabled", "shadowWidthPct", "shadowGapPct",
  "badgeEnabled", "badgeCorner", "badgeWidthPct", "badgeOffsetXPct", "badgeOffsetYPct",
  ...SIZE_GUIDE_FIELDS,
];

const DECORATION_SET: ReadonlySet<string> = new Set(DECORATION_FIELDS);

/** True for a decoration flag or one of its geometry fields. */
export function isDecorationField(field: keyof UploadSettings): boolean {
  return DECORATION_SET.has(field as string);
}

/** One icon's applied fields; an absent key means "this icon pinned it itself". */
export type AppliedFields = Partial<Record<keyof UploadSettings, true>>;
/** pair id → the fields a global control wrote into that icon. */
export type AppliedMap = Record<string, AppliedFields>;

const FIELD_SET: ReadonlySet<string> = new Set(SETTINGS_FIELDS);

export function isApplied(
  marks: AppliedFields | null | undefined, field: keyof UploadSettings,
): boolean {
  return marks?.[field] === true;
}

/** A stored mark payload → only `true` entries for real settings fields survive (RULE 13). */
export function parseApplied(raw: unknown): AppliedFields {
  if (!isRecord(raw)) return {};
  const out: AppliedFields = {};
  for (const [field, value] of Object.entries(raw)) {
    if (FIELD_SET.has(field) && value === true) out[field as keyof UploadSettings] = true;
  }
  return out;
}

export function parseAppliedMap(raw: unknown): AppliedMap {
  if (!isRecord(raw)) return {};
  const out: AppliedMap = {};
  for (const [id, value] of Object.entries(raw)) {
    const marks = parseApplied(value);
    if (id !== "" && Object.keys(marks).length > 0) out[id] = marks;
  }
  return out;
}

/** Add or drop one mark; null when nothing is left — an empty map entry is never stored. */
export function withApplied(
  marks: AppliedFields | null | undefined, field: keyof UploadSettings, on: boolean,
): AppliedFields | null {
  const next: AppliedFields = { ...(marks ?? {}) };
  if (on) next[field] = true;
  else delete next[field];
  return Object.keys(next).length === 0 ? null : next;
}

export function appliedEqual(
  a: AppliedFields | null | undefined, b: AppliedFields | null | undefined,
): boolean {
  const fields = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const field of fields) if (isApplied(a, field as keyof UploadSettings) !== isApplied(b, field as keyof UploadSettings)) return false;
  return true;
}

/** The fields a row really pins: its override keys minus the globally applied ones. */
export function localKeys(
  keys: readonly (keyof UploadSettings)[], marks: AppliedFields | null | undefined,
): (keyof UploadSettings)[] {
  return keys.filter((field) => !isApplied(marks, field));
}

/**
 * The override map a reset-to-inherited leaves: every decoration field stays
 * (flag and geometry, whatever its provenance) and so does any field a global
 * control applied; every other LOCAL pin is dropped.
 */
export function withoutLocalPins(
  patch: SettingsOverrides, marks: AppliedFields | null | undefined,
): SettingsOverrides {
  const kept: SettingsOverrides = {};
  for (const field of Object.keys(patch) as (keyof SettingsOverrides)[]) {
    const key = field as keyof UploadSettings;
    if (isDecorationField(key) || isApplied(marks, key)) Object.assign(kept, { [field]: patch[field] });
  }
  return kept;
}

/** The local, resettable pins a row carries: not a decoration, not applied by a global control. */
export function localResetKeys(
  keys: readonly (keyof UploadSettings)[], marks: AppliedFields | null | undefined,
): (keyof UploadSettings)[] {
  return localKeys(keys, marks).filter((field) => !isDecorationField(field));
}

/** The marks whose field survived in `kept`; null when none did. */
export function marksOf(kept: SettingsOverrides, marks: AppliedFields | null | undefined): AppliedFields | null {
  const next: AppliedFields = {};
  for (const field of Object.keys(marks ?? {}) as (keyof UploadSettings)[]) {
    if (kept[field] !== undefined) next[field] = true;
  }
  return Object.keys(next).length === 0 ? null : next;
}

/** Apply an `applied` patch onto the map; null (or empty) clears that row's marks. */
export function mergeApplied(
  map: AppliedMap, patch: Record<string, AppliedFields | null> | undefined,
): AppliedMap {
  if (patch === undefined) return map;
  const next = { ...map };
  for (const [id, marks] of Object.entries(patch)) {
    if (marks === null || Object.keys(marks).length === 0) delete next[id];
    else next[id] = marks;
  }
  return next;
}
