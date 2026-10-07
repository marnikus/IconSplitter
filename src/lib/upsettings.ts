// upsettings.ts — export settings for the SVG-to-upload tab (prompt §4/§5).
// Owns: the documented defaults, the ONE clamp rule every numeric read goes
// through (RULE 13), the per-icon override record (only the fields the icon
// actually set), the effective-settings merge, and the answer to "which fields
// does this icon override?". Global defaults never erase an icon's overrides:
// the two records live apart and merge only at read time.

import { DEFAULT_PREVIEW_BACKGROUND, parsePreviewBackground, type PreviewBackground } from "./svgbackground";
import { isRecord } from "./isrecord";

/** The pt→px reference DPI the stroke setting is defined against (1pt = 1.25px). */
export const STROKE_REF_DPI = 96;

export interface ExportSettings {
  /** Uniform padding on every side, % of the artboard side. */
  paddingPct: number;
  /** The opaque colour flattened under the JPEG and emitted in the export SVG. */
  background: PreviewBackground;
  /** Output stroke width in pt at STROKE_REF_DPI. */
  strokePt: number;
  /** JPEG target resolution in megapixels (integer dimensions come from upraster). */
  jpegMpx: number;
  /** JPEG encode quality. */
  jpegQuality: number;
  optimizeSvg: boolean;
  includeEps: boolean;
  /** square = default 1000×1000 artboard; fit = the content's own aspect ratio. */
  artboard: "square" | "fit";
}

/** Only the fields an icon set — everything else is inherited from the defaults. */
export type ExportOverride = Partial<ExportSettings>;

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  paddingPct: 8,
  background: DEFAULT_PREVIEW_BACKGROUND,
  strokePt: 2.2,
  jpegMpx: 15.1,
  jpegQuality: 0.92,
  optimizeSvg: true,
  includeEps: false,
  artboard: "square",
};

const RANGES = {
  paddingPct: { min: 0, max: 40, dflt: 8 },
  strokePt: { min: 0.2, max: 8, dflt: 2.2 },
  jpegMpx: { min: 1, max: 30, dflt: 15.1 },
  jpegQuality: { min: 0.5, max: 0.98, dflt: 0.92 },
} as const;

export type NumericField = keyof typeof RANGES;
const NUMERIC_FIELDS = Object.keys(RANGES) as NumericField[];

/** The one clamp: range-bounded, and a non-number is the field's default. */
export function clampExportNumber(field: NumericField, value: number): number {
  const r = RANGES[field];
  if (!Number.isFinite(value)) return r.dflt;
  return Math.min(r.max, Math.max(r.min, value));
}

/** A stored settings payload: unknown or invalid fields fall back per-field. */
export function sanitizeExportSettings(raw: unknown): ExportSettings {
  if (!isRecord(raw)) return { ...DEFAULT_EXPORT_SETTINGS };
  return {
    paddingPct: clampExportNumber("paddingPct", asNum(raw.paddingPct)),
    strokePt: clampExportNumber("strokePt", asNum(raw.strokePt)),
    jpegMpx: clampExportNumber("jpegMpx", asNum(raw.jpegMpx)),
    jpegQuality: clampExportNumber("jpegQuality", asNum(raw.jpegQuality)),
    background: parsePreviewBackground(raw.background),
    optimizeSvg: typeof raw.optimizeSvg === "boolean" ? raw.optimizeSvg : DEFAULT_EXPORT_SETTINGS.optimizeSvg,
    includeEps: typeof raw.includeEps === "boolean" ? raw.includeEps : DEFAULT_EXPORT_SETTINGS.includeEps,
    artboard: raw.artboard === "fit" ? "fit" : "square",
  };
}

function asNum(value: unknown): number {
  return typeof value === "number" ? value : Number.NaN;
}

/**
 * A stored override: keeps only fields with a valid value (the same clamps as
 * the defaults — no second policy), drops unknown keys, and returns null when
 * nothing valid remains, so "no override" and "empty override" are one state.
 */
export function sanitizeOverride(raw: unknown): ExportOverride | null {
  if (!isRecord(raw)) return null;
  const out: ExportOverride = {};
  for (const field of NUMERIC_FIELDS) {
    if (typeof raw[field] === "number") out[field] = clampExportNumber(field, raw[field] as number);
  }
  if (typeof raw.optimizeSvg === "boolean") out.optimizeSvg = raw.optimizeSvg;
  if (typeof raw.includeEps === "boolean") out.includeEps = raw.includeEps;
  if (isRecord(raw.background)) out.background = parsePreviewBackground(raw.background);
  if (raw.artboard === "fit" || raw.artboard === "square") out.artboard = raw.artboard;
  return Object.keys(out).length === 0 ? null : out;
}

/** Effective settings = defaults, overridden per field by what the icon set. */
export function effectiveSettings(defaults: ExportSettings, o: ExportOverride | null): ExportSettings {
  const clean = sanitizeOverride(o);
  return clean === null ? { ...defaults } : { ...defaults, ...clean };
}

/** The fields this icon overrides, in the declared order. */
export function overriddenFields(o: ExportOverride | null): (keyof ExportSettings)[] {
  if (o === null) return [];
  const order: (keyof ExportSettings)[] = [
    "paddingPct", "background", "strokePt", "jpegMpx", "jpegQuality", "optimizeSvg", "includeEps", "artboard",
  ];
  return order.filter((f) => o[f] !== undefined);
}

/** The per-field question the settings dialog asks: inherited or overridden? */
export function isOverridden(o: ExportOverride | null, field: keyof ExportSettings): boolean {
  return o !== null && o[field] !== undefined;
}
