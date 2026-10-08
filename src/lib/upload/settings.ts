// settings.ts — the "SVG to upload" settings domain (RULE 3/13).
// Owns: one UploadSettings shape with its documented defaults and ranges, the
// global-defaults + per-icon-override merge, override validation on read, and
// the fingerprint selective re-export keys on. Thumbnail zoom is NOT here —
// it is display-only (design §2.12) and lives in lib/zoom.

import { normalizeHex } from "../svgbackground";
import { fnv1a32 } from "../pairing";
import { isRecord } from "../isrecord";

export interface ArtboardSetting {
  readonly preset: ArtboardPreset;
  /** Custom dimensions; preset values are canonical and ignore these numbers. */
  readonly width: number;
  readonly height: number;
}

export const ARTBOARD_OPTIONS = [
  { id: "fit", label: "Fit artwork (content size)" },
  { id: "128x128", label: "128 × 128 px", width: 128, height: 128 },
  { id: "256x256", label: "256 × 256 px", width: 256, height: 256 },
  { id: "512x512", label: "512 × 512 px", width: 512, height: 512 },
  { id: "1024x1024", label: "1024 × 1024 px", width: 1024, height: 1024 },
  { id: "2048x2048", label: "2048 × 2048 px", width: 2048, height: 2048 },
  { id: "640x480", label: "640 × 480 px · 4:3", width: 640, height: 480 },
  { id: "1200x800", label: "1200 × 800 px · 3:2", width: 1200, height: 800 },
  { id: "1920x1080", label: "1920 × 1080 px · 16:9", width: 1920, height: 1080 },
  { id: "1080x1920", label: "1080 × 1920 px · 9:16", width: 1080, height: 1920 },
  { id: "custom", label: "Custom aspect ratio" },
] as const;

export type ArtboardPreset = (typeof ARTBOARD_OPTIONS)[number]["id"];
export const ARTBOARD_MIN_PX = 16;
export const ARTBOARD_MAX_PX = 8192;
export const DEFAULT_ARTBOARD_SETTING: ArtboardSetting = {
  preset: "512x512", width: 512, height: 512,
};

export interface UploadSettings {
  /** Uniform margin: % of the board's largest side, or fitted content in Fit mode. */
  paddingPct: number;
  /** Opaque background flattened into JPEG; fill-only SVGs also paint it. */
  background: string;
  /** Stroke width in pt at 96 DPI (1 pt = 4/3 px); 0 = leave artwork strokes untouched. */
  strokePt: number;
  /** The output SVG artboard in px, or fit-to-content; custom dimensions set its ratio. */
  artboard: ArtboardSetting;
  /** JPEG target resolution in megapixels (default 15.1). */
  jpegMegapixels: number;
  /** JPEG quality 0..1. */
  jpegQuality: number;
  /** Optimize the export SVG copy with SVGO (default on). */
  optimizeSvg: boolean;
  /** Also write a genuine EPS (default off). */
  includeEps: boolean;
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

export const DEFAULT_UPLOAD_SETTINGS: UploadSettings = {
  paddingPct: PADDING_DEFAULT,
  background: BACKGROUND_DEFAULT,
  strokePt: STROKE_DEFAULT,
  artboard: DEFAULT_ARTBOARD_SETTING,
  jpegMegapixels: MP_DEFAULT,
  jpegQuality: QUALITY_DEFAULT,
  optimizeSvg: true,
  includeEps: false,
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

export function clampArtboardPx(value: unknown): number {
  return Math.round(clampNum(value, ARTBOARD_MIN_PX, ARTBOARD_MAX_PX, DEFAULT_ARTBOARD_SETTING.width));
}

function clampNum(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** A stored preset/custom object → canonical dimensions, or null when malformed. */
export function parseArtboardSetting(raw: unknown): ArtboardSetting | null {
  if (!isRecord(raw) || typeof raw.preset !== "string") return null;
  const option = ARTBOARD_OPTIONS.find((candidate) => candidate.id === raw.preset);
  if (option === undefined) return null;
  if (option.id === "custom") return customArtboard(raw);
  if ("width" in option) return { preset: option.id, width: option.width, height: option.height };
  return { ...DEFAULT_ARTBOARD_SETTING, preset: "fit" };
}

function customArtboard(raw: Record<string, unknown>): ArtboardSetting | null {
  const width = finiteNumber(raw.width);
  const height = finiteNumber(raw.height);
  if (width === null || height === null) return null;
  return { preset: "custom", width: clampArtboardPx(width), height: clampArtboardPx(height) };
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** The actual px board; null means the fitted content-sized artboard. */
export function artboardDimensions(setting: ArtboardSetting): { width: number; height: number } | null {
  if (setting.preset === "fit") return null;
  if (setting.preset === "custom") return { width: clampArtboardPx(setting.width), height: clampArtboardPx(setting.height) };
  const option = ARTBOARD_OPTIONS.find((candidate) => candidate.id === setting.preset);
  return option !== undefined && "width" in option ? { width: option.width, height: option.height } : null;
}

/** A stored defaults payload → validated settings; one bad field costs one default (RULE 13). */
export function normalizeSettings(raw: unknown): UploadSettings {
  if (!isRecord(raw)) return { ...DEFAULT_UPLOAD_SETTINGS };
  return {
    paddingPct: clampPaddingPct(raw.paddingPct),
    background: normalizeHex(str(raw.background)) ?? BACKGROUND_DEFAULT,
    strokePt: clampStrokePt(raw.strokePt),
    artboard: parseArtboardSetting(raw.artboard) ?? DEFAULT_ARTBOARD_SETTING,
    jpegMegapixels: clampMegapixels(raw.jpegMegapixels),
    jpegQuality: clampQuality(raw.jpegQuality),
    optimizeSvg: raw.optimizeSvg !== false,
    includeEps: raw.includeEps === true,
  };
}

/** A stored per-icon override payload → only the valid fields survive. */
export function parseOverrides(raw: unknown): SettingsOverrides {
  if (!isRecord(raw)) return {};
  return {
    ...parseNumericOverrides(raw), ...parseBackgroundOverride(raw),
    ...parseArtboardOverride(raw), ...parseBooleanOverrides(raw),
  };
}

function parseNumericOverrides(raw: Record<string, unknown>): SettingsOverrides {
  const out: SettingsOverrides = {};
  if (typeof raw.paddingPct === "number") out.paddingPct = clampPaddingPct(raw.paddingPct);
  if (typeof raw.strokePt === "number") out.strokePt = clampStrokePt(raw.strokePt);
  if (typeof raw.jpegMegapixels === "number") out.jpegMegapixels = clampMegapixels(raw.jpegMegapixels);
  if (typeof raw.jpegQuality === "number") out.jpegQuality = clampQuality(raw.jpegQuality);
  return out;
}

function parseBackgroundOverride(raw: Record<string, unknown>): SettingsOverrides {
  if (typeof raw.background !== "string") return {};
  const background = normalizeHex(raw.background);
  return background === null ? {} : { background };
}

function parseArtboardOverride(raw: Record<string, unknown>): SettingsOverrides {
  const artboard = parseArtboardSetting(raw.artboard);
  return artboard === null ? {} : { artboard };
}

function parseBooleanOverrides(raw: Record<string, unknown>): SettingsOverrides {
  const out: SettingsOverrides = {};
  if (typeof raw.optimizeSvg === "boolean") out.optimizeSvg = raw.optimizeSvg;
  if (typeof raw.includeEps === "boolean") out.includeEps = raw.includeEps;
  return out;
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
    && sameArtboard(a.artboard, b.artboard)
    && a.jpegMegapixels === b.jpegMegapixels && a.jpegQuality === b.jpegQuality
    && a.optimizeSvg === b.optimizeSvg && a.includeEps === b.includeEps;
}

function sameArtboard(a: ArtboardSetting, b: ArtboardSetting): boolean {
  return a.preset === b.preset && a.width === b.width && a.height === b.height;
}

/** Stable fingerprint over the canonical field order — selective re-export keys on this. */
export function settingsFingerprint(s: UploadSettings): string {
  const canonical = JSON.stringify([
    round3(s.paddingPct), s.background, round3(s.strokePt),
    [s.artboard.preset, s.artboard.width, s.artboard.height],
    round3(s.jpegMegapixels), round3(s.jpegQuality), s.optimizeSvg, s.includeEps,
  ]);
  return fnv1a32(canonical).toString(16).padStart(8, "0");
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}
