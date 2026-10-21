// decorations.ts — which artboard decorations the CHECKED-SET control applied to
// this icon (2026-10-21, archive/2026-10-21-upload-applied-decorations).
//
// The three enable flags still live in the icon's settings overrides: the
// export, the preview, the fingerprint and the staleness check already read
// them there. But a flag written by the global "Checked icons" checkbox is not
// a local pin — it is a selection-level application, recorded here so the
// icon's dialog can say `inherited` and the row's pin count ignores it. Only a
// change made inside that icon's own dialog makes the flag a real local pin.

import { isRecord } from "../isrecord";
import type { UploadSettings } from "./settings";

export const DECORATION_KEYS = ["shadow", "badge", "sizeGuide"] as const;
export type DecorationKey = (typeof DECORATION_KEYS)[number];

/** The settings field each decoration switches. */
export const DECORATION_FIELD = {
  shadow: "shadowEnabled", badge: "badgeEnabled", sizeGuide: "sizeGuideEnabled",
} as const;

/** One icon's applied marks; an absent key means "not applied here". */
export type AppliedDecorations = Partial<Record<DecorationKey, true>>;
/** pair id → the decorations the selection control applied to that icon. */
export type AppliedMap = Record<string, AppliedDecorations>;

/** The decoration a settings field switches, or null for every other field. */
export function decorationOf(field: keyof UploadSettings): DecorationKey | null {
  for (const key of DECORATION_KEYS) if ((DECORATION_FIELD[key] as string) === (field as string)) return key;
  return null;
}

export function isApplied(marks: AppliedDecorations | null | undefined, key: DecorationKey): boolean {
  return marks?.[key] === true;
}

/** A stored mark payload → only `true` entries survive (RULE 13). */
export function parseApplied(raw: unknown): AppliedDecorations {
  if (!isRecord(raw)) return {};
  const out: AppliedDecorations = {};
  for (const key of DECORATION_KEYS) if (raw[key] === true) out[key] = true;
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
  marks: AppliedDecorations | null | undefined, key: DecorationKey, on: boolean,
): AppliedDecorations | null {
  const next: AppliedDecorations = { ...(marks ?? {}) };
  if (on) next[key] = true;
  else delete next[key];
  return Object.keys(next).length === 0 ? null : next;
}

export function appliedEqual(
  a: AppliedDecorations | null | undefined, b: AppliedDecorations | null | undefined,
): boolean {
  return DECORATION_KEYS.every((key) => isApplied(a, key) === isApplied(b, key));
}

/** The fields a row really pins: its override keys minus the applied flags. */
export function localKeys(
  keys: readonly (keyof UploadSettings)[], marks: AppliedDecorations | null | undefined,
): (keyof UploadSettings)[] {
  return keys.filter((field) => {
    const key = decorationOf(field);
    return key === null || !isApplied(marks, key);
  });
}

/** Apply an `applied` patch onto the map; null (or empty) clears that row's marks. */
export function mergeApplied(
  map: AppliedMap, patch: Record<string, AppliedDecorations | null> | undefined,
): AppliedMap {
  if (patch === undefined) return map;
  const next = { ...map };
  for (const [id, marks] of Object.entries(patch)) {
    if (marks === null || Object.keys(marks).length === 0) delete next[id];
    else next[id] = marks;
  }
  return next;
}
