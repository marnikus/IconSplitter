// exportformats.ts — the ONE export-format domain both flows read (2026-11-17):
// the SVG to upload tab (UploadSettings extends this interface) and the sheet
// builder's own export settings store. Flags, the EPS converter choice, the
// JPEG resolution/quality, SVGO, stroke and text expansion and the artboard
// rescale live here so the two dialogs, the fingerprint and the packages can
// never drift apart. Stored payloads validate per field (RULE 13).
import { isRecord } from "./isrecord";
import { DEFAULT_CONVERTER, parseConverterId } from "./upload/epsconv/registry";
import type { EpsConverterId } from "./upload/epsconv/types";
import {
  clampMegapixels, clampQuality, clampRescaleMegapixels, MP_DEFAULT, QUALITY_DEFAULT,
} from "./upload/settingsnumbers";

export interface ExportFormatOptions {
  /** Deliver an SVG file in the next exported package. */
  includeSvg: boolean;
  /** Render and deliver a JPEG in the next exported package. */
  includeJpeg: boolean;
  /** Also write a genuine EPS; anything the converter cannot write fails that stage honestly. */
  includeEps: boolean;
  /** Who writes the EPS: the built-in subset writer, or Inkscape through the local helper. */
  epsConverter: EpsConverterId;
  /** JPEG resolution in megapixels when it does not follow the artboard. */
  jpegMegapixels: number;
  /** JPEG quality 0.5…1. */
  jpegQuality: number;
  /** The JPEG is the artboard itself (its px, after any rescale); off = the MP above. */
  jpegMatchArtboard: boolean;
  /** Optimize the export SVG copy with SVGO — viewBox, geometry, strokes and metadata preserved. */
  optimizeSvg: boolean;
  /**
   * Clean the saved SVG and the EPS built from it (2026-11-19): the stock-clean
   * pass drops the generator's paperwork — `data-*` hooks, `class`/`aria-*`,
   * repeated xmlns, comments, our provenance `<metadata>` JSON and float noise.
   * The picture, its viewBox, the artboard's px and Title/description/tags stay.
   */
  cleanExport: boolean;
  /** Strokes become filled shapes; the SVG, JPEG and EPS all ship without strokes. */
  expandStrokes: boolean;
  /** Every <text> becomes filled glyph outlines; what cannot be outlined fails honestly. */
  expandText: boolean;
  /** Rescale the FULL artboard, ratio kept, until its area is rescaleMegapixels. */
  rescaleArtboard: boolean;
  /** The megapixel target of that rescale; dormant while the box is off. */
  rescaleMegapixels: number;
  /** While rescaling: scale stroke widths proportionally; off = every stroke keeps its printed px. */
  rescaleStrokes: boolean;
}

export const DEFAULT_FORMAT_OPTIONS: ExportFormatOptions = {
  includeSvg: true, includeJpeg: true, includeEps: false, epsConverter: DEFAULT_CONVERTER,
  jpegMegapixels: MP_DEFAULT, jpegQuality: QUALITY_DEFAULT, jpegMatchArtboard: true,
  optimizeSvg: true, cleanExport: true, expandStrokes: false, expandText: false,
  rescaleArtboard: false, rescaleMegapixels: 20, rescaleStrokes: true,
};

/** Boolean fields, in the order the dialogs show them. */
export const FORMAT_FLAGS = [
  "includeSvg", "includeJpeg", "includeEps", "jpegMatchArtboard", "optimizeSvg",
  "cleanExport", "expandStrokes", "expandText", "rescaleArtboard", "rescaleStrokes",
] as const;

/** Fields that default ON read back on unless stored `false`; the rest read back off unless stored `true`. */
const DEFAULT_ON = new Set<string>([
  "includeSvg", "includeJpeg", "jpegMatchArtboard", "optimizeSvg", "cleanExport", "rescaleStrokes",
]);

const FORMAT_NUMBERS: ["jpegMegapixels" | "jpegQuality" | "rescaleMegapixels", (value: unknown) => number][] = [
  ["jpegMegapixels", clampMegapixels],
  ["jpegQuality", clampQuality],
  ["rescaleMegapixels", clampRescaleMegapixels],
];

export const FORMAT_OPTION_FIELDS: (keyof ExportFormatOptions)[] = [
  ...FORMAT_FLAGS, "epsConverter", ...FORMAT_NUMBERS.map(([key]) => key),
];

/** A stored payload → validated options; one bad field costs one default (RULE 13). */
export function normalizeFormatOptions(raw: unknown): ExportFormatOptions {
  if (!isRecord(raw)) return { ...DEFAULT_FORMAT_OPTIONS };
  const out: ExportFormatOptions = { ...DEFAULT_FORMAT_OPTIONS };
  for (const key of FORMAT_FLAGS) {
    const value = raw[key];
    if (typeof value === "boolean") out[key] = value;
    else if (DEFAULT_ON.has(key) && value === undefined) out[key] = true;
  }
  for (const [key, clamp] of FORMAT_NUMBERS) {
    const value = raw[key];
    if (typeof value === "number") out[key] = clamp(value);
  }
  const converter = raw.epsConverter;
  if (typeof converter === "string" && parseConverterId(converter) === converter) out.epsConverter = converter;
  return out;
}

/** The format fields a stored override payload pins; everything else stays inherited. */
export function readFormatOverrides(raw: Record<string, unknown>): Partial<ExportFormatOptions> {
  const out: Partial<ExportFormatOptions> = {};
  for (const key of FORMAT_FLAGS) {
    const value = raw[key];
    if (typeof value === "boolean") out[key] = value;
  }
  for (const [key, clamp] of FORMAT_NUMBERS) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) out[key] = clamp(value);
  }
  const converter = raw.epsConverter;
  if (typeof converter === "string" && parseConverterId(converter) === converter) out.epsConverter = converter;
  return out;
}

export function formatOptionsEqual(a: ExportFormatOptions, b: ExportFormatOptions): boolean {
  return FORMAT_OPTION_FIELDS.every((field) => a[field] === b[field]);
}

/**
 * The uniform factor that makes width × height cover `megapixels`, and the
 * rounded px size at that factor (never above the target, ratio kept).
 */
export function rescaleSize(width: number, height: number, megapixels: number): { width: number; height: number; factor: number } {
  const factor = Math.sqrt((megapixels * 1_000_000) / Math.max(1, width * height));
  return { ...megapixelSize(width, height, megapixels * 1_000_000, factor), factor };
}

/** The largest px size of the same ratio whose area stays at or below `maxPixels`. */
export function megapixelSize(width: number, height: number, maxPixels = 1_000_000, factor = Math.sqrt(maxPixels / Math.max(1, width * height))): { width: number; height: number } {
  const ratio = width / Math.max(1, height);
  let w = Math.max(1, Math.floor(width * factor));
  let h = Math.max(1, Math.floor(w / ratio));
  while (w * h > maxPixels) { w -= 1; h = Math.max(1, Math.floor(w / ratio)); }
  return { width: w, height: h };
}

/** The JPEG's px: the artboard itself while the match box is ticked, else the megapixel resolution. */
export function jpegTargetSize(width: number, height: number, o: Pick<ExportFormatOptions, "jpegMatchArtboard" | "jpegMegapixels">): { width: number; height: number } {
  return o.jpegMatchArtboard ? { width, height } : megapixelSize(width, height, o.jpegMegapixels * 1_000_000);
}

/**
 * The artboard the export really has: its own px, or the rescale's px while
 * that box is on. Both dialogs name this size in the JPEG row, so the hint and
 * the packaged JPEG read the same numbers.
 */
export function exportArtboardSize(
  size: { width: number; height: number },
  o: Pick<ExportFormatOptions, "rescaleArtboard" | "rescaleMegapixels">,
): { width: number; height: number } {
  if (!o.rescaleArtboard) return { width: size.width, height: size.height };
  const scaled = rescaleSize(size.width, size.height, o.rescaleMegapixels);
  return { width: scaled.width, height: scaled.height };
}

/** What the JPEG row says it will write: the artboard's own px, or the MP rule at its ratio. */
/** `kind`: the raster the row makes — the upload flow's JPEG, or the sheet builder's PNG (2026-11-23). */
export function jpegNote(size: { width: number; height: number } | null, match = true, kind: "JPEG" | "PNG" = "JPEG"): string {
  if (size === null) return "rendered from the vectors at this resolution (default 15.1)";
  return match
    ? `the ${kind} is the artboard itself: ${size.width}×${size.height} px — untick for a bigger file`
    : "rendered from the vectors at this resolution, at the artboard's aspect ratio";
}
