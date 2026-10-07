// settings.ts — the "SVG to upload" settings domain (RULE 3/13).
// Owns: one UploadSettings shape with its documented defaults and ranges, the
// global-defaults + per-icon-override merge, override validation on read, and
// the fingerprint selective re-export keys on. Thumbnail zoom is NOT here —
// it is display-only (design §2.12) and lives in lib/zoom.

import { normalizeHex } from "../svgbackground";
import { fnv1a32 } from "../pairing";
import { isRecord } from "../isrecord";

export interface UploadSettings {
  /** Uniform padding on all four sides, % of the fitted artwork's largest side. */
  paddingPct: number;
  /** Opaque background the JPEG flattens onto and the export SVG paints. */
  background: string;
  /** Stroke width in pt at 96 DPI (1 pt = 4/3 px); 0 = leave artwork strokes untouched. */
  strokePt: number;
  /** JPEG target resolution in megapixels (default 15.1). */
  jpegMegapixels: number;
  /** JPEG quality 0..1. */
  jpegQuality: number;
  /** Optimize the export SVG copy with SVGO (default on). */
  optimizeSvg: boolean;
  /** Also write a genuine EPS (default off). */
  includeEps: boolean;
  /** Final artboard preset: square side in px, or "custom" for W×H below. */
  artboard: string;
  /** Custom artboard width in px (used only when artboard = "custom"). */
  artboardWidth: number;
  /** Custom artboard height in px (used only when artboard = "custom"). */
  artboardHeight: number;
}

export type SettingsOverrides = Partial<UploadSettings>;

export const PADDING_MIN = 0;
export const PADDING_MAX = 50;
export const PADDING_DEFAULT = 8;
export const STROKE_MIN = 0;
export const STROKE_MAX = 24;
export const STROKE_DEFAULT = 0;
export const MP_MIN = 1;
export const MP_MAX = 64;
export const MP_DEFAULT = 15.1;
export const QUALITY_MIN = 0.5;
export const QUALITY_MAX = 1;
export const QUALITY_DEFAULT = 0.92;
export const BACKGROUND_DEFAULT = "#ffffff";
export const ARTBOARD_PRESETS = ["256", "512", "1024", "2048", "4096", "custom"] as const;
export const ARTBOARD_DEFAULT = "512";
export const ARTBOARD_MIN = 16;
export const ARTBOARD_MAX = 4096;
export const ARTBOARD_SIZE_DEFAULT = 512;

export const DEFAULT_UPLOAD_SETTINGS: UploadSettings = {
  paddingPct: PADDING_DEFAULT,
  background: BACKGROUND_DEFAULT,
  strokePt: STROKE_DEFAULT,
  jpegMegapixels: MP_DEFAULT,
  jpegQuality: QUALITY_DEFAULT,
  optimizeSvg: true,
  includeEps: false,
  artboard: ARTBOARD_DEFAULT,
  artboardWidth: ARTBOARD_SIZE_DEFAULT,
  artboardHeight: ARTBOARD_SIZE_DEFAULT,
};

export function clampPaddingPct(value: unknown): number {
  return clampNum(value, PADDING_MIN, PADDING_MAX, PADDING_DEFAULT);
}

export function clampStrokePt(value: unknown): number {
  return clampNum(value, STROKE_MIN, STROKE_MAX, STROKE_DEFAULT);
}

export function clampMegapixels(value: unknown): number {
  return clampNum(value, MP_MIN, MP_MAX, MP_DEFAULT);
}

export function clampQuality(value: unknown): number {
  return clampNum(value, QUALITY_MIN, QUALITY_MAX, QUALITY_DEFAULT);
}

/** A preset id, or the default when unknown (RULE 13: never a guess). */
export function clampArtboard(value: unknown): string {
  return typeof value === "string" && (ARTBOARD_PRESETS as readonly string[]).includes(value)
    ? value
    : ARTBOARD_DEFAULT;
}

export function clampArtboardSize(value: unknown): number {
  return clampNum(value, ARTBOARD_MIN, ARTBOARD_MAX, ARTBOARD_SIZE_DEFAULT);
}

function clampNum(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** A stored defaults payload → validated settings; one bad field costs one default (RULE 13). */
export function normalizeSettings(raw: unknown): UploadSettings {
  if (!isRecord(raw)) return { ...DEFAULT_UPLOAD_SETTINGS };
  return {
    paddingPct: clampPaddingPct(raw.paddingPct),
    background: normalizeHex(str(raw.background)) ?? BACKGROUND_DEFAULT,
    strokePt: clampStrokePt(raw.strokePt),
    jpegMegapixels: clampMegapixels(raw.jpegMegapixels),
    jpegQuality: clampQuality(raw.jpegQuality),
    optimizeSvg: raw.optimizeSvg !== false,
    includeEps: raw.includeEps === true,
    artboard: clampArtboard(raw.artboard),
    artboardWidth: clampArtboardSize(raw.artboardWidth),
    artboardHeight: clampArtboardSize(raw.artboardHeight),
  };
}

/** A stored per-icon override payload → only the valid fields survive. */
export function parseOverrides(raw: unknown): SettingsOverrides {
  if (!isRecord(raw)) return {};
  const out: SettingsOverrides = {};
  if (typeof raw.paddingPct === "number") out.paddingPct = clampPaddingPct(raw.paddingPct);
  if (typeof raw.strokePt === "number") out.strokePt = clampStrokePt(raw.strokePt);
  if (typeof raw.jpegMegapixels === "number") out.jpegMegapixels = clampMegapixels(raw.jpegMegapixels);
  if (typeof raw.jpegQuality === "number") out.jpegQuality = clampQuality(raw.jpegQuality);
  if (typeof raw.background === "string") {
    const hex = normalizeHex(raw.background);
    if (hex !== null) out.background = hex;
  }
  if (typeof raw.optimizeSvg === "boolean") out.optimizeSvg = raw.optimizeSvg;
  if (typeof raw.includeEps === "boolean") out.includeEps = raw.includeEps;
  parseArtboardOverrides(raw, out);
  return out;
}

function parseArtboardOverrides(raw: Record<string, unknown>, out: SettingsOverrides): void {
  if (typeof raw.artboard === "string" && (ARTBOARD_PRESETS as readonly string[]).includes(raw.artboard)) {
    out.artboard = raw.artboard;
  }
  if (typeof raw.artboardWidth === "number") out.artboardWidth = clampArtboardSize(raw.artboardWidth);
  if (typeof raw.artboardHeight === "number") out.artboardHeight = clampArtboardSize(raw.artboardHeight);
}

/** The settings one icon exports with: defaults under, overrides on top. */
export function effectiveSettings(defaults: UploadSettings, overrides: SettingsOverrides): UploadSettings {
  return { ...defaults, ...overrides };
}

export interface ArtboardSize {
  width: number;
  height: number;
}

/** The final artboard px: the preset's square, or the custom W×H. */
export function artboardSizeOf(s: UploadSettings): ArtboardSize {
  if (s.artboard === "custom") {
    return { width: Math.round(clampArtboardSize(s.artboardWidth)), height: Math.round(clampArtboardSize(s.artboardHeight)) };
  }
  const side = Number(s.artboard);
  const square = Number.isFinite(side) ? Math.round(clampArtboardSize(side)) : ARTBOARD_SIZE_DEFAULT;
  return { width: square, height: square };
}

/** Which fields an override actually pins — the "overridden" markers in the UI. */
export function overrideKeys(overrides: SettingsOverrides): (keyof UploadSettings)[] {
  return (Object.keys(overrides) as (keyof UploadSettings)[]).filter((k) => overrides[k] !== undefined);
}

export function settingsEqual(a: UploadSettings, b: UploadSettings): boolean {
  return a.paddingPct === b.paddingPct && a.background === b.background && a.strokePt === b.strokePt
    && a.jpegMegapixels === b.jpegMegapixels && a.jpegQuality === b.jpegQuality
    && a.optimizeSvg === b.optimizeSvg && a.includeEps === b.includeEps
    && a.artboard === b.artboard && a.artboardWidth === b.artboardWidth && a.artboardHeight === b.artboardHeight;
}

/** Stable fingerprint over the canonical field order — selective re-export keys on this. */
export function settingsFingerprint(s: UploadSettings): string {
  const canonical = JSON.stringify([
    round3(s.paddingPct), s.background, round3(s.strokePt),
    round3(s.jpegMegapixels), round3(s.jpegQuality), s.optimizeSvg, s.includeEps,
    s.artboard, Math.round(s.artboardWidth), Math.round(s.artboardHeight),
  ]);
  return fnv1a32(canonical).toString(16).padStart(8, "0");
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}
