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
export const STROKE_MAX = 24;
export const STROKE_DEFAULT = 0;
export const MP_MIN = 1;
export const MP_MAX = 64;
export const MP_DEFAULT = 15.1;
export const QUALITY_MIN = 0.5;
export const QUALITY_MAX = 1;
export const QUALITY_DEFAULT = 0.92;
export const BACKGROUND_DEFAULT = "#ffffff";

/**
 * The export artboard's size. `content` hugs the artwork (the padded fit, the
 * original behaviour); `preset`/`custom` pin an EXACT size in px, so the
 * artwork is scaled into it — `custom` is also how a non-square aspect ratio is
 * chosen (width : height).
 */
export interface Artboard {
  mode: "content" | "preset" | "custom";
  /** Square edge in px for `preset` mode — always one of ARTBOARD_PRESETS. */
  size: number;
  /** Exact px for `custom` mode; their ratio is the aspect ratio. */
  width: number;
  height: number;
}

/** The popular square icon sizes a stock site asks for. */
export const ARTBOARD_PRESETS = [256, 512, 1024, 2048, 4096];
export const ARTBOARD_MIN = 16;
export const ARTBOARD_MAX = 8192;
/** The canvas/JPEG ceiling shared with MP_MAX: a pinned artboard may not exceed it. */
export const ARTBOARD_MAX_PIXELS = MP_MAX * 1e6;
export const CONTENT_ARTBOARD: Artboard = { mode: "content", size: 512, width: 512, height: 512 };


export const DEFAULT_UPLOAD_SETTINGS: UploadSettings = {
  paddingPct: PADDING_DEFAULT,
  background: BACKGROUND_DEFAULT,
  strokePt: STROKE_DEFAULT,
  jpegMegapixels: MP_DEFAULT,
  jpegQuality: QUALITY_DEFAULT,
  optimizeSvg: true,
  includeEps: false,
  artboard: { ...CONTENT_ARTBOARD },
  jpegMatchArtboard: true,
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

/** A stored/patch artboard → a valid one; anything unreadable becomes `content`. */
export function clampArtboard(value: unknown): Artboard {
  if (!isRecord(value)) return { ...CONTENT_ARTBOARD };
  const mode = value.mode;
  if (mode !== "content" && mode !== "preset" && mode !== "custom") return { ...CONTENT_ARTBOARD };
  if (mode === "content") return { ...CONTENT_ARTBOARD, mode: "content" };
  if (mode === "preset") return { mode, size: nearestPreset(value.size), width: 512, height: 512 };
  const fitted = fitIntoCeiling(clampEdge(value.width), clampEdge(value.height));
  return { mode, size: 512, width: fitted.width, height: fitted.height };
}

/** The exact px size an artboard pins, or null when it hugs the content. */
export function artboardSize(a: Artboard): { width: number; height: number } | null {
  if (a.mode === "preset") return { width: a.size, height: a.size };
  if (a.mode === "custom") return { width: a.width, height: a.height };
  return null;
}

function nearestPreset(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return CONTENT_ARTBOARD.size;
  let best = ARTBOARD_PRESETS[0];
  for (const preset of ARTBOARD_PRESETS) {
    if (Math.abs(preset - n) < Math.abs(best - n)) best = preset;
  }
  return best;
}

function clampEdge(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return CONTENT_ARTBOARD.width;
  return Math.round(Math.min(ARTBOARD_MAX, Math.max(ARTBOARD_MIN, n)));
}

/** Over the pixel ceiling both edges shrink together — the aspect ratio survives. */
function fitIntoCeiling(width: number, height: number): { width: number; height: number } {
  const area = width * height;
  if (area <= ARTBOARD_MAX_PIXELS) return { width, height };
  const k = Math.sqrt(ARTBOARD_MAX_PIXELS / area);
  return { width: Math.max(ARTBOARD_MIN, Math.round(width * k)), height: Math.max(ARTBOARD_MIN, Math.round(height * k)) };
}

export function clampQuality(value: unknown): number {
  return clampNum(value, QUALITY_MIN, QUALITY_MAX, QUALITY_DEFAULT);
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
    jpegMatchArtboard: raw.jpegMatchArtboard !== false,
  };
}

/** A stored per-icon override payload → only the valid fields survive. */
export function parseOverrides(raw: unknown): SettingsOverrides {
  if (!isRecord(raw)) return {};
  const out: SettingsOverrides = {};
  readNumbers(raw, out);
  readFlags(raw, out);
  readBackground(raw, out);
  readArtboard(raw, out);
  return out;
}

/** The numeric fields and their clamps, so adding one is a single line here. */
const NUMERIC_FIELDS: [string, (value: number) => number][] = [
  ["paddingPct", clampPaddingPct],
  ["strokePt", clampStrokePt],
  ["jpegMegapixels", clampMegapixels],
  ["jpegQuality", clampQuality],
];

function readNumbers(raw: Record<string, unknown>, out: SettingsOverrides): void {
  for (const [key, clamp] of NUMERIC_FIELDS) {
    const value = raw[key];
    if (typeof value === "number") Object.assign(out, { [key]: clamp(value) });
  }
}

function readFlags(raw: Record<string, unknown>, out: SettingsOverrides): void {
  for (const key of ["optimizeSvg", "includeEps", "jpegMatchArtboard"]) {
    const value = raw[key];
    if (typeof value === "boolean") Object.assign(out, { [key]: value });
  }
}

function readBackground(raw: Record<string, unknown>, out: SettingsOverrides): void {
  const value = raw.background;
  if (typeof value !== "string") return;
  const hex = normalizeHex(value);
  if (hex !== null) out.background = hex;
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

export function settingsEqual(a: UploadSettings, b: UploadSettings): boolean {
  return a.paddingPct === b.paddingPct && a.background === b.background && a.strokePt === b.strokePt
    && a.jpegMegapixels === b.jpegMegapixels && a.jpegQuality === b.jpegQuality
    && a.optimizeSvg === b.optimizeSvg && a.includeEps === b.includeEps
    && a.jpegMatchArtboard === b.jpegMatchArtboard
    && artboardsEqual(a.artboard, b.artboard);
}

function artboardsEqual(a: Artboard, b: Artboard): boolean {
  return a.mode === b.mode && a.size === b.size && a.width === b.width && a.height === b.height;
}

/**
 * Every overrideable field, in canonical order — the ONE list the undo
 * equality and the store readers derive from (2026-10-08: the hand-kept copy
 * in `uploadundo.ts` had already missed the artboard, so a change that only
 * touched it compared EQUAL and could be swallowed).
 */
export const SETTINGS_FIELDS: (keyof UploadSettings)[] = [
  "paddingPct", "background", "strokePt", "jpegMegapixels", "jpegQuality",
  "optimizeSvg", "includeEps", "artboard", "jpegMatchArtboard",
];

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
    round3(s.paddingPct), s.background, round3(s.strokePt),
    round3(s.jpegMegapixels), round3(s.jpegQuality), s.optimizeSvg, s.includeEps,
    s.jpegMatchArtboard,
    [s.artboard.mode, s.artboard.size, s.artboard.width, s.artboard.height],
  ]);
  return fnv1a32(canonical).toString(16).padStart(8, "0");
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}
