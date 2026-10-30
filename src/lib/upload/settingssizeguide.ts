// settingssizeguide.ts — the S/L size guide's settings block (2026-10-20).
// Owned beside settingsnumbers so the upload settings domain stays one shape
// while this decoration's nine fields (and their one corner vocabulary) keep
// their own file. settings.ts re-exports all of it.
import { isRecord } from "../isrecord";
import type { SizeGuideCorner } from "./sizeguide";
export type { SizeGuideCorner };
import {
  SIZE_GUIDE_GAP_DEFAULT, SIZE_GUIDE_LARGE_DEFAULT, SIZE_GUIDE_OFFSET_DEFAULT,
  SIZE_GUIDE_SMALL_DEFAULT, SIZE_GUIDE_STROKE_DEFAULT,
  clampSizeGuideGapPct, clampSizeGuideLargePct, clampSizeGuideOffsetPct, clampSizeGuideSmallPct,
  clampSizeGuideStrokePx,
} from "./settingsnumbers";

export const SIZE_GUIDE_CORNERS: readonly SizeGuideCorner[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
/** The reference artboard puts the guide bottom-left, opposite the default badge corner. */
export const SIZE_GUIDE_CORNER_DEFAULT: SizeGuideCorner = "bottom-left";

export function parseSizeGuideCorner(value: unknown): SizeGuideCorner | null {
  return typeof value === "string" && SIZE_GUIDE_CORNERS.includes(value as SizeGuideCorner) ? value as SizeGuideCorner : null;
}

/** The size guide's own settings: opt-in per icon, placement/logo widths in % and strokes in px. */
export interface SizeGuideSettings {
  /** The S/L size guide: the finished icon repeated at two smaller sizes inside the artboard, opt-in per icon. */
  sizeGuideEnabled: boolean;
  /** Which artboard corner holds the guide; insets run inward from the chosen edges. */
  sizeGuideCorner: SizeGuideCorner;
  /** The S logo's width, % of artboard width. */
  sizeGuideSmallPct: number;
  /** The L logo's width, % of artboard width. */
  sizeGuideLargePct: number;
  /** The S logo's own stroke width in px, written verbatim on the repeat (0 = the artwork's own widths, scaled with it). */
  sizeGuideSmallStrokePx: number;
  /** The L logo's own stroke width in px, written verbatim on the repeat (0 = the artwork's own widths, scaled with it). */
  sizeGuideLargeStrokePx: number;
  /** Clear distance between the two logos, % of artboard width. */
  sizeGuideGapPct: number;
  /** Inward distance from the chosen left/right edge, % of artboard width. */
  sizeGuideOffsetXPct: number;
  /** Inward distance from the chosen top/bottom edge, % of artboard height. */
  sizeGuideOffsetYPct: number;
}

export const SIZE_GUIDE_DEFAULTS: SizeGuideSettings = {
  sizeGuideEnabled: false,
  sizeGuideCorner: SIZE_GUIDE_CORNER_DEFAULT,
  sizeGuideSmallPct: SIZE_GUIDE_SMALL_DEFAULT,
  sizeGuideLargePct: SIZE_GUIDE_LARGE_DEFAULT,
  sizeGuideSmallStrokePx: SIZE_GUIDE_STROKE_DEFAULT,
  sizeGuideLargeStrokePx: SIZE_GUIDE_STROKE_DEFAULT,
  sizeGuideGapPct: SIZE_GUIDE_GAP_DEFAULT,
  sizeGuideOffsetXPct: SIZE_GUIDE_OFFSET_DEFAULT,
  sizeGuideOffsetYPct: SIZE_GUIDE_OFFSET_DEFAULT,
};

/** Every size-guide field in canonical order (undo equality, markers, offline checks). */
export const SIZE_GUIDE_FIELDS: (keyof SizeGuideSettings)[] = [
  "sizeGuideEnabled", "sizeGuideCorner", "sizeGuideSmallPct", "sizeGuideLargePct",
  "sizeGuideSmallStrokePx", "sizeGuideLargeStrokePx", "sizeGuideGapPct",
  "sizeGuideOffsetXPct", "sizeGuideOffsetYPct",
];

/** The numbers, their clamps and any retired key accepted on read only (RULE 13). */
const NUMBERS: [keyof SizeGuideSettings, (value: unknown) => number, string?][] = [
  ["sizeGuideSmallPct", clampSizeGuideSmallPct],
  ["sizeGuideLargePct", clampSizeGuideLargePct],
  ["sizeGuideSmallStrokePx", clampSizeGuideStrokePx, "sizeGuideSmallStrokePct"],
  ["sizeGuideLargeStrokePx", clampSizeGuideStrokePx, "sizeGuideLargeStrokePct"],
  ["sizeGuideGapPct", clampSizeGuideGapPct],
  ["sizeGuideOffsetXPct", clampSizeGuideOffsetPct],
  ["sizeGuideOffsetYPct", clampSizeGuideOffsetPct],
];

function rawNumber(raw: Record<string, unknown>, key: string, alias?: string): unknown {
  return raw[key] ?? (alias === undefined ? undefined : raw[alias]);
}

/** A stored defaults payload → validated guide fields; one bad field costs one default. */
export function normalizeSizeGuide(raw: unknown): SizeGuideSettings {
  if (!isRecord(raw)) return { ...SIZE_GUIDE_DEFAULTS };
  const numbers = Object.fromEntries(NUMBERS.map(([key, clamp, alias]) => [key, clamp(rawNumber(raw, key, alias))]));
  return {
    sizeGuideEnabled: false, // Only an icon override can opt in; persisted defaults must never enable unchecked icons.
    sizeGuideCorner: parseSizeGuideCorner(raw.sizeGuideCorner) ?? SIZE_GUIDE_CORNER_DEFAULT,
    ...numbers,
  } as SizeGuideSettings;
}

/** A stored per-icon override payload → only the valid guide fields survive. */
export function readSizeGuideOverrides(raw: unknown): Partial<SizeGuideSettings> {
  if (!isRecord(raw)) return {};
  const out: Partial<SizeGuideSettings> = {};
  for (const [key, clamp, alias] of NUMBERS) {
    const value = rawNumber(raw, key, alias);
    if (typeof value === "number" && Number.isFinite(value)) Object.assign(out, { [key]: clamp(value) });
  }
  if (typeof raw.sizeGuideEnabled === "boolean") out.sizeGuideEnabled = raw.sizeGuideEnabled;
  const corner = parseSizeGuideCorner(raw.sizeGuideCorner);
  if (corner !== null) out.sizeGuideCorner = corner;
  return out;
}
