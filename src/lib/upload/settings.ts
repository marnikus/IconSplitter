// settings.ts — the "SVG to upload" settings domain (RULE 3/13).
// Owns: one UploadSettings shape with its documented defaults and ranges, the
// global-defaults + per-icon-override merge, override validation on read, and
// the fingerprint selective re-export keys on. The artboard lives in
// lib/upload/artboard (re-exported here). Thumbnail zoom is NOT here — it is
// display-only (design §2.12) and lives in lib/zoom.
//
// Paints (2026-10-08, stock review): the background is `transparent` or a hex
// — transparent means no background in the SVG/EPS, and the JPEG (no alpha)
// flattens onto white; the stroke colour is the artwork's own or one hex that
// every visible stroke gets. Both are plain strings so they store, compare and
// fingerprint like every other field.

import { normalizeHex } from "../svgbackground";
import { fnv1a32 } from "../pairing";
import { isRecord } from "../isrecord";
import { artboardsEqual, clampArtboard, CONTENT_ARTBOARD, type Artboard } from "./artboard";
import { DEFAULT_CONVERTER, parseConverterId } from "./epsconv/registry";
import type { EpsConverterId } from "./epsconv/types";

export {
  ARTBOARD_MAX, ARTBOARD_MAX_PIXELS, ARTBOARD_MIN, ARTBOARD_PRESETS, CONTENT_ARTBOARD,
  artboardSize, clampArtboard, type Artboard,
} from "./artboard";

export interface UploadSettings {
  /** Uniform padding on all four sides, % of the fitted artwork's largest side. */
  paddingPct: number;
  /** `transparent`, or the opaque hex the export SVG/EPS paint and the JPEG flattens onto. */
  background: string;
  /**
   * Stroke width in px — the file's own user units, written verbatim on every
   * visible stroke (2026-10-08: "2 in the setting is 2 in the SVG"); 0 = leave
   * the artwork's own strokes (their widths follow the baked geometry).
   */
  strokePx: number;
  /** The hex every visible stroke gets, defined ONCE on the root (default `#000000`), or `artwork` (the strokes keep their own paint). */
  strokeColor: string;
  /** JPEG target resolution in megapixels (default 15.1). */
  jpegMegapixels: number;
  /** JPEG quality 0..1. */
  jpegQuality: number;
  /** Optimize the export SVG copy with SVGO (default on). */
  optimizeSvg: boolean;
  /** Also write a genuine EPS (default off). */
  includeEps: boolean;
  /** Which converter writes that EPS (2026-10-09): the built-in subset writer, or Inkscape through the local helper. */
  epsConverter: EpsConverterId;
  /**
   * Expand every visible stroke into a filled shape (2026-10-09, what some
   * stocks require): the SVG, JPEG and EPS all ship without strokes. Off = the
   * strokes stay strokes.
   */
  expandStrokes: boolean;
  /** The artboard the export is built at: content-hugging, or an exact px size. */
  artboard: Artboard;
  /**
   * When the artboard pins a px size, render the JPEG at exactly those px
   * (default). Switching it off keeps the artboard's RATIO but renders at
   * `jpegMegapixels` instead — a small artboard must never cap the resolution.
   */
  jpegMatchArtboard: boolean;
}

export type SettingsOverrides = Partial<UploadSettings>;

export const PADDING_MIN = 0;
export const PADDING_MAX = 50;
export const PADDING_DEFAULT = 8;
export const STROKE_MIN = 0;
export const STROKE_MAX = 32;
export const STROKE_DEFAULT = 0;
export const MP_MIN = 1;
export const MP_MAX = 64;
export const MP_DEFAULT = 15.1;
export const QUALITY_MIN = 0.5;
export const QUALITY_MAX = 1;
export const QUALITY_DEFAULT = 0.92;
/** The background value that paints nothing in the SVG/EPS. */
export const TRANSPARENT = "transparent";
export const BACKGROUND_DEFAULT = TRANSPARENT;
/** What a format without alpha (JPEG, EPS opacity mixing) paints a transparent background as. */
export const FLATTEN_DEFAULT = "#ffffff";
/** The stroke-colour value that leaves every stroke's own paint alone. */
export const STROKE_COLOR_ARTWORK = "artwork";
/** The stock standard for line icons (2026-10-08): ONE global `stroke="#000"` in the file. */
export const STROKE_COLOR_DEFAULT = "#000000";

export const DEFAULT_UPLOAD_SETTINGS: UploadSettings = {
  paddingPct: PADDING_DEFAULT,
  background: BACKGROUND_DEFAULT,
  strokePx: STROKE_DEFAULT,
  strokeColor: STROKE_COLOR_DEFAULT,
  jpegMegapixels: MP_DEFAULT,
  jpegQuality: QUALITY_DEFAULT,
  optimizeSvg: true,
  includeEps: false,
  epsConverter: DEFAULT_CONVERTER,
  expandStrokes: false,
  artboard: { ...CONTENT_ARTBOARD },
  jpegMatchArtboard: true,
};

export function clampPaddingPct(value: unknown): number {
  return clampNum(value, PADDING_MIN, PADDING_MAX, PADDING_DEFAULT);
}

export function clampStrokePx(value: unknown): number {
  return clampNum(value, STROKE_MIN, STROKE_MAX, STROKE_DEFAULT);
}

export function clampMegapixels(value: unknown): number {
  return clampNum(value, MP_MIN, MP_MAX, MP_DEFAULT);
}

export function clampQuality(value: unknown): number {
  return clampNum(value, QUALITY_MIN, QUALITY_MAX, QUALITY_DEFAULT);
}

function clampNum(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** A paint field: its sentinel word (`transparent` / `artwork`) or a normalized hex; null = unreadable. */
export function readPaint(value: unknown, sentinel: string): string | null {
  if (typeof value !== "string") return null;
  return value === sentinel ? sentinel : normalizeHex(value);
}

export function isTransparent(background: string): boolean {
  return background === TRANSPARENT;
}

/** The hex a format without alpha paints for this background. */
export function flattenColor(background: string): string {
  return isTransparent(background) ? FLATTEN_DEFAULT : normalizeHex(background) ?? FLATTEN_DEFAULT;
}

/** A stored defaults payload → validated settings; one bad field costs one default (RULE 13). */
export function normalizeSettings(raw: unknown): UploadSettings {
  if (!isRecord(raw)) return { ...DEFAULT_UPLOAD_SETTINGS };
  return {
    paddingPct: clampPaddingPct(raw.paddingPct),
    background: readPaint(raw.background, TRANSPARENT) ?? BACKGROUND_DEFAULT,
    strokePx: clampStrokePx(raw.strokePx ?? raw.strokePt), // strokePt: the pre-2026-10-08 name, same number
    strokeColor: readPaint(raw.strokeColor, STROKE_COLOR_ARTWORK) ?? STROKE_COLOR_DEFAULT,
    jpegMegapixels: clampMegapixels(raw.jpegMegapixels),
    jpegQuality: clampQuality(raw.jpegQuality),
    optimizeSvg: raw.optimizeSvg !== false,
    includeEps: raw.includeEps === true,
    epsConverter: parseConverterId(raw.epsConverter),
    expandStrokes: raw.expandStrokes === true,
    artboard: clampArtboard(raw.artboard),
    jpegMatchArtboard: raw.jpegMatchArtboard !== false,
  };
}

/** A stored per-icon override payload → only the valid fields survive. */
export function parseOverrides(raw: unknown): SettingsOverrides {
  if (!isRecord(raw)) return {};
  const out: SettingsOverrides = {};
  readNumbers(raw, out);
  readFlags(raw, out);
  readPaints(raw, out);
  readArtboard(raw, out);
  if (typeof raw.epsConverter === "string" && parseConverterId(raw.epsConverter) === raw.epsConverter) out.epsConverter = raw.epsConverter;
  return out;
}

/** The numeric fields and their clamps, so adding one is a single line here. */
const NUMERIC_FIELDS: [string, (value: number) => number][] = [
  ["paddingPct", clampPaddingPct],
  ["strokePx", clampStrokePx],
  ["jpegMegapixels", clampMegapixels],
  ["jpegQuality", clampQuality],
];

/** The paint fields and the word that means "none of ours". */
const PAINT_FIELDS: ["background" | "strokeColor", string][] = [
  ["background", TRANSPARENT],
  ["strokeColor", STROKE_COLOR_ARTWORK],
];

function readNumbers(raw: Record<string, unknown>, out: SettingsOverrides): void {
  for (const [key, clamp] of NUMERIC_FIELDS) {
    const value = raw[key] ?? (key === "strokePx" ? raw.strokePt : undefined); // the old name reads, is never written
    if (typeof value === "number") Object.assign(out, { [key]: clamp(value) });
  }
}

function readFlags(raw: Record<string, unknown>, out: SettingsOverrides): void {
  for (const key of ["optimizeSvg", "includeEps", "jpegMatchArtboard", "expandStrokes"]) {
    const value = raw[key];
    if (typeof value === "boolean") Object.assign(out, { [key]: value });
  }
}

function readPaints(raw: Record<string, unknown>, out: SettingsOverrides): void {
  for (const [key, sentinel] of PAINT_FIELDS) {
    const paint = readPaint(raw[key], sentinel);
    if (paint !== null) out[key] = paint;
  }
}

/** The artboard is stored only when it really pins something (content ≠ an override). */
function readArtboard(raw: Record<string, unknown>, out: SettingsOverrides): void {
  const value = raw.artboard;
  if (isRecord(value) && value.mode !== "content") out.artboard = clampArtboard(value);
}

/** The settings one icon exports with: defaults under, overrides on top. */
export function effectiveSettings(defaults: UploadSettings, overrides: SettingsOverrides): UploadSettings {
  return { ...defaults, ...overrides };
}

/** Which fields an override actually pins — the "overridden" markers in the UI. */
export function overrideKeys(overrides: SettingsOverrides): (keyof UploadSettings)[] {
  return (Object.keys(overrides) as (keyof UploadSettings)[]).filter((k) => overrides[k] !== undefined);
}

/**
 * Every overrideable field, in canonical order — the ONE list the undo
 * equality, the store readers and `settingsEqual` derive from (2026-10-08: the
 * hand-kept copy in `uploadundo.ts` had already missed the artboard, so a
 * change that only touched it compared EQUAL and could be swallowed).
 */
export const SETTINGS_FIELDS: (keyof UploadSettings)[] = [
  "paddingPct", "background", "strokePx", "strokeColor", "jpegMegapixels", "jpegQuality",
  "optimizeSvg", "includeEps", "artboard", "jpegMatchArtboard", "epsConverter", "expandStrokes",
];

export function settingsEqual(a: UploadSettings, b: UploadSettings): boolean {
  return overridesEqual(a, b);
}

/** Two partial override payloads that pin the same fields with the same values. */
export function overridesEqual(a: SettingsOverrides, b: SettingsOverrides): boolean {
  return SETTINGS_FIELDS.every((field) => fieldValuesEqual(a[field], b[field]));
}

/** Field values are primitives except the artboard, which compares as a whole. */
function fieldValuesEqual(a: unknown, b: unknown): boolean {
  if (!isRecord(a) || !isRecord(b)) return a === b;
  return artboardsEqual(clampArtboard(a), clampArtboard(b));
}

/** Stable fingerprint over the canonical field order — selective re-export keys on this. */
export function settingsFingerprint(s: UploadSettings): string {
  const canonical = JSON.stringify([
    round3(s.paddingPct), s.background, round3(s.strokePx), s.strokeColor,
    round3(s.jpegMegapixels), round3(s.jpegQuality), s.optimizeSvg, s.includeEps,
    s.jpegMatchArtboard,
    [s.artboard.mode, s.artboard.size, s.artboard.width, s.artboard.height],
    // appended ONLY when set (2026-10-09), so every package exported before the
    // field existed keeps its fingerprint; the converter is a tool choice the
    // planner compares against the record, not geometry — never in here.
    ...(s.expandStrokes ? ["expand"] : []),
  ]);
  return fnv1a32(canonical).toString(16).padStart(8, "0");
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
