// decorations.ts — the decorations a GLOBAL control gave an icon (2026-10-21,
// archive/2026-10-21-decorations-are-not-overrides).
//
// A decoration (Shadow, corner badge, S/L size guide) is a selection-level
// choice made in the Export settings popup. Local row overrides come from its
// own dialog or an explicit Apply as local snapshot. These live in
// different maps: `applied: { pairId: DecorationValues }` carries the VALUES a
// global control wrote, and the icon's overrides carry only what the user
// pinned locally. The effective settings merge defaults ← applied ← overrides,
// so a decoration renders and exports as before, the dialog reads it as
// `inherited`, and "Reset to inherited" can delete a row's whole override map
// without ever removing a decoration.

import { isRecord } from "../isrecord";
import { overridesEqual, parseOverrides, type SettingsOverrides, type UploadSettings } from "./settings";
import { SIZE_GUIDE_FIELDS } from "./settingssizeguide";

export const DECORATION_KEYS = ["shadow", "badge", "sizeGuide"] as const;
export type DecorationKey = (typeof DECORATION_KEYS)[number];

/** The settings field each decoration switches. */
export const DECORATION_FIELD = {
  shadow: "shadowEnabled", badge: "badgeEnabled", sizeGuide: "sizeGuideEnabled",
} as const;

/** Every field a decoration owns: its enable flag and its geometry. */
export const DECORATION_FIELDS: (keyof UploadSettings)[] = [
  "shadowEnabled", "shadowWidthPct", "shadowGapPct",
  "badgeEnabled", "badgeTemplateSvg", "badgeCorner", "badgeWidthPct", "badgeOffsetXPct", "badgeOffsetYPct",
  ...SIZE_GUIDE_FIELDS,
];

/** The fields of ONE decoration (flag + geometry) — "remove the shadow" clears these. */
export function fieldsOf(key: DecorationKey): (keyof UploadSettings)[] {
  return DECORATION_FIELDS.filter((field) => field.startsWith(key));
}

const DECORATION_SET: ReadonlySet<string> = new Set(DECORATION_FIELDS);

/** True for a decoration flag or one of its geometry fields. */
export function isDecorationField(field: keyof UploadSettings): boolean {
  return DECORATION_SET.has(field as string);
}

/** The values a global control wrote into one icon; absent = it applied nothing. */
export type DecorationValues = SettingsOverrides;
/** pair id → the decorations a global control applied to that icon. */
export type AppliedMap = Record<string, DecorationValues>;

/** A stored applied payload → validated decoration values (RULE 13: junk is dropped). */
export function parseApplied(raw: unknown): DecorationValues {
  const parsed = parseOverrides(raw);
  const out: DecorationValues = {};
  for (const field of DECORATION_FIELDS) {
    if (parsed[field] !== undefined) Object.assign(out, { [field]: parsed[field] });
  }
  return out;
}

export function parseAppliedMap(raw: unknown): AppliedMap {
  if (!isRecord(raw)) return {};
  const out: AppliedMap = {};
  for (const [id, value] of Object.entries(raw)) {
    const decorations = parseApplied(value);
    if (id !== "" && Object.keys(decorations).length > 0) out[id] = decorations;
  }
  return out;
}

/** One icon's applied decorations ({} when a global control never wrote any). */
export function decorationsOf(map: AppliedMap, id: string): DecorationValues {
  return map[id] ?? {};
}

export function decorationsEqual(
  a: DecorationValues | null | undefined, b: DecorationValues | null | undefined,
): boolean {
  return overridesEqual(a ?? {}, b ?? {});
}

/** Replace one icon's applied decorations; an empty result removes its entry. */
export function setDecorations(
  map: AppliedMap, id: string, values: DecorationValues,
): AppliedMap {
  const next = { ...map };
  if (Object.keys(values).length === 0) delete next[id];
  else next[id] = values;
  return next;
}

/** Drop every field of one decoration (the popup's "remove" gesture). */
export function withoutDecoration(values: DecorationValues, key: DecorationKey): DecorationValues {
  const next: DecorationValues = { ...values };
  for (const field of fieldsOf(key)) delete next[field];
  return next;
}

/** Decoration maps use the same atomic replacement semantics as local pins. */
export { patchSettingsMap as mergeApplied } from "./settingspatch";

/** The fields a global control must leave for an icon to take an applied value. */
export function clearedFor(key: DecorationKey, overrides: SettingsOverrides): SettingsOverrides {
  const next: SettingsOverrides = { ...overrides };
  for (const field of fieldsOf(key)) delete next[field];
  return next;
}

/**
 * The settings one icon exports with: defaults under, the decorations a global
 * control applied, then the icon's own local overrides on top.
 */
export function rowSettings(
  defaults: UploadSettings, id: string, overrides: Record<string, SettingsOverrides>, applied: AppliedMap,
): UploadSettings {
  return { ...defaults, ...decorationsOf(applied, id), ...(overrides[id] ?? {}) };
}

/**
 * Move decoration fields that older builds stored as ordinary overrides into
 * the applied map, so a decoration never reads `overridden` and a reset can
 * never delete it (2026-10-21).
 */
export function migrateDecorations(
  overrides: SettingsOverrides, applied: DecorationValues,
): { overrides: SettingsOverrides; applied: DecorationValues } {
  const keptOverrides: SettingsOverrides = { ...overrides };
  const merged: DecorationValues = { ...applied };
  for (const field of DECORATION_FIELDS) {
    if (keptOverrides[field] === undefined) continue;
    if (merged[field] === undefined) Object.assign(merged, { [field]: keptOverrides[field] });
    delete keptOverrides[field];
  }
  return { overrides: keptOverrides, applied: merged };
}

/** The whole stored maps, migrated: every row's decoration fields move to `applied`. */
export function migrateOverrides(
  overrides: Record<string, SettingsOverrides>, applied: AppliedMap,
): { overrides: Record<string, SettingsOverrides>; applied: AppliedMap } {
  const nextOverrides: Record<string, SettingsOverrides> = {};
  let nextApplied: AppliedMap = { ...applied };
  for (const [id, row] of Object.entries(overrides)) {
    const moved = migrateDecorations(row, decorationsOf(nextApplied, id));
    if (Object.keys(moved.overrides).length > 0) nextOverrides[id] = moved.overrides;
    nextApplied = setDecorations(nextApplied, id, moved.applied);
  }
  return { overrides: nextOverrides, applied: nextApplied };
}
