// settings.ts — artboard, background, stroke, JPEG and tool settings for the
// SVG-to-upload tab (design §4 C4/C5, §5). Why it is a pure module: the same
// numbers decide a transform, a raster size and a JSON record, and every one of
// them is validated in ONE place. Global defaults hold the values; a per-icon
// override holds only the fields that icon changed, so "inherited" stays a fact
// the row can show and a reset is a deletion rather than a rewrite. Ranges clamp
// instead of throwing (a broken stored file must never kill the tab), and a bulk
// apply returns exactly ONE undo record — one user action, one undo.
//
// Deliberately absent: thumbnail zoom. Zoom is display-only (the request says so)
// and lives in the zoom prefs; nothing here can scale an output.

import { DEFAULT_PREVIEW_BACKGROUND, parsePreviewBackground, type PreviewBackground } from "../svgbackground";
import { isRecord } from "../isrecord";
import { LIMITS as UNIT_LIMITS, type LengthUnit } from "./units";

export const LIMITS = {
  scaleMin: 0.1,
  scaleMax: 8,
  strokeMax: UNIT_LIMITS.strokeMax,
  paddingMax: UNIT_LIMITS.paddingMax,
  targetMpMin: 1,
  targetMpMax: 30,
  qualityMin: 0.3,
  qualityMax: 1,
} as const;

export type JpegProfile = "sRGB-implied";

/**
 * The row's settings cell in the template's words: the effective stroke, the
 * padding and the JPEG target. Read from the values the export uses, so a row can
 * never advertise a number the pipeline will not apply.
 */
export function settingsLineOf(values: UploadDefaults): string {
  const stroke = values.stroke.enabled ? `stroke ${trim(values.stroke.value)} ${values.stroke.unit}` : "no stroke";
  const pad = `pad ${trim(values.padding.value)} ${values.padding.unit}`;
  const scale = values.outputScale === 1 ? "" : ` · scale ${trim(values.outputScale)}×`;
  return `${stroke} · ${pad}${scale} · JPEG ${trim(values.jpeg.targetMp)} MP`;
}

/** 2.20 -> "2.2", 10 -> "10": numbers as the user typed them, never 2.2000001. */
function trim(value: number): string {
  return String(Number(value.toFixed(2)));
}

export interface PaddingSetting {
  value: number;
  unit: LengthUnit;
}

export interface StrokeSetting {
  value: number;
  unit: LengthUnit;
  /** false = keep the document's own strokes untouched (the default). */
  enabled: boolean;
}

export interface JpegSetting {
  targetMp: number;
  quality: number;
  /** Browsers write no ICC profile; the JSON says so honestly. */
  profile: JpegProfile;
}

export interface UploadDefaults {
  padding: PaddingSetting;
  outputScale: number;
  background: PreviewBackground;
  stroke: StrokeSetting;
  jpeg: JpegSetting;
  /** SWGO/SVGO on by default (the request says so). */
  optimizeSvg: boolean;
  /** EPS is optional and converter-gated. */
  includeEps: boolean;
  /**
   * The EPS converter endpoint the user configured; "" means none, and a
   * requested EPS without one is Partial (§13). Only http(s) is accepted.
   */
  epsConverter: string;
}

export type SettingField = keyof UploadDefaults;
export type SettingOrigin = "default" | "override";

export interface UploadSettings {
  defaults: UploadDefaults;
  /** Keyed by pair id — stable across rescans, sorts and restarts. */
  overrides: Record<string, Partial<UploadDefaults>>;
}

/** One undoable bulk apply: what changed, for which icons, before and after. */
export interface BulkUndo {
  ids: string[];
  patch: Partial<UploadDefaults>;
  before: UploadSettings;
  after: UploadSettings;
}

export const DEFAULT_UPLOAD: UploadDefaults = {
  padding: { value: 10, unit: "%" },
  outputScale: 1,
  background: DEFAULT_PREVIEW_BACKGROUND,
  stroke: { value: 2.2, unit: "pt", enabled: false },
  jpeg: { targetMp: 15.1, quality: 0.9, profile: "sRGB-implied" },
  optimizeSvg: true,
  includeEps: false,
  epsConverter: "",
};

export interface EffectiveSettings {
  values: UploadDefaults;
  origin: Record<SettingField, SettingOrigin>;
  /** Fields this icon did not change — shown as "inherited". */
  inherited: SettingField[];
}

export const SETTING_FIELDS: readonly SettingField[] = [
  "padding", "outputScale", "background", "stroke", "jpeg", "optimizeSvg", "includeEps", "epsConverter",
];

/** The numbers an icon actually exports with, and where each one came from. */
export function effectiveSettings(settings: UploadSettings, id: string): EffectiveSettings {
  const override = settings.overrides[id] ?? {};
  const values: UploadDefaults = { ...settings.defaults, ...override };
  const origin = {} as Record<SettingField, SettingOrigin>;
  const inherited: SettingField[] = [];
  for (const field of SETTING_FIELDS) {
    const own = Object.prototype.hasOwnProperty.call(override, field);
    origin[field] = own ? "override" : "default";
    if (!own) inherited.push(field);
  }
  return { values, origin, inherited };
}

/** Short list for the row chip: which fields follow the global defaults. */
export function inheritedFields(settings: UploadSettings, id: string): SettingField[] {
  return effectiveSettings(settings, id).inherited;
}

/** Edits the global defaults (one field at a time, validated). */
export function setDefault(settings: UploadSettings, patch: Partial<UploadDefaults>): UploadSettings {
  return { defaults: mergeDefaults(settings.defaults, patch), overrides: settings.overrides };
}

/** Writes ONLY the given fields for one icon; everything else stays inherited. */
export function setOverride(settings: UploadSettings, id: string, patch: Partial<UploadDefaults>): UploadSettings {
  const existing = settings.overrides[id] ?? {};
  const next: Partial<UploadDefaults> = { ...existing, ...patch };
  if (patch.jpeg !== undefined) next.jpeg = { ...(existing.jpeg ?? settings.defaults.jpeg), ...patch.jpeg };
  return { ...settings, overrides: { ...settings.overrides, [id]: next } };
}

/** The per-icon reset: the override is deleted, so the icon inherits again. */
export function resetOverride(settings: UploadSettings, id: string): UploadSettings {
  const overrides = { ...settings.overrides };
  delete overrides[id];
  return { ...settings, overrides };
}

/** One bulk apply over one selection — exactly one undoable record. */
export function applyBulk(
  settings: UploadSettings, ids: readonly string[], patch: Partial<UploadDefaults>,
): { next: UploadSettings; undo: BulkUndo[] } {
  if (ids.length === 0) return { next: settings, undo: [] };
  const next = ids.reduce((s, id) => setOverride(s, id, patch), settings);
  return { next, undo: [{ ids: [...ids], patch, before: settings, after: next }] };
}

/** Tolerant read of the stored payload; junk falls back field by field. */
export function parseUploadSettings(raw: unknown): UploadSettings {
  if (!isRecord(raw)) return defaultsOnly();
  const defaults = parseDefaults(isRecord(raw.defaults) ? raw.defaults : {});
  const overrides: Record<string, Partial<UploadDefaults>> = {};
  if (isRecord(raw.overrides)) {
    for (const [id, value] of Object.entries(raw.overrides)) {
      const partial = parseOverride(isRecord(value) ? value : {});
      if (Object.keys(partial).length > 0) overrides[id] = partial;
    }
  }
  return { defaults, overrides };
}

function defaultsOnly(): UploadSettings {
  return { defaults: DEFAULT_UPLOAD, overrides: {} };
}

function parseDefaults(raw: Record<string, unknown>): UploadDefaults {
  return mergeDefaults(DEFAULT_UPLOAD, parseOverride(raw));
}

/** Only the fields that are present AND valid — an override never half-fills. */
function parseOverride(raw: Record<string, unknown>): Partial<UploadDefaults> {
  const out: Partial<UploadDefaults> = {};
  const padding = parseLengthSetting(raw.padding);
  if (padding !== null) out.padding = padding;
  const scale = numOrNull(raw.outputScale);
  if (scale !== null) out.outputScale = clamp(scale, LIMITS.scaleMin, LIMITS.scaleMax);
  if (isRecord(raw.background)) out.background = parsePreviewBackground(raw.background);
  const stroke = parseStrokeSetting(raw.stroke);
  if (stroke !== null) out.stroke = stroke;
  const jpeg = parseJpeg(raw.jpeg);
  if (jpeg !== null) out.jpeg = jpeg;
  if (typeof raw.optimizeSvg === "boolean") out.optimizeSvg = raw.optimizeSvg;
  if (typeof raw.includeEps === "boolean") out.includeEps = raw.includeEps;
  if (typeof raw.epsConverter === "string") out.epsConverter = parseConverter(raw.epsConverter);
  return out;
}

/** A converter endpoint: an absolute http(s) URL, or "" (none configured). */
function parseConverter(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? trimmed : "";
  } catch {
    return "";
  }
}

function parseLengthSetting(raw: unknown): PaddingSetting | null {
  if (!isRecord(raw)) return null;
  if (!isUnit(raw.unit)) return null;
  const value = numOrNull(raw.value);
  if (value === null) return null;
  return { value: clamp(value, 0, LIMITS.paddingMax), unit: raw.unit };
}

function parseStrokeSetting(raw: unknown): StrokeSetting | null {
  if (!isRecord(raw)) return null;
  // A stroke width in % has no SVG meaning; only pt and px are accepted.
  if (raw.unit !== "pt" && raw.unit !== "px") return null;
  const value = numOrNull(raw.value);
  if (value === null) return null;
  return { value: clamp(value, 0, LIMITS.strokeMax), unit: raw.unit, enabled: raw.enabled === true };
}

function parseJpeg(raw: unknown): JpegSetting | null {
  if (!isRecord(raw)) return null;
  const targetMp = numOrNull(raw.targetMp);
  const quality = numOrNull(raw.quality);
  if (targetMp === null || quality === null) return null;
  return {
    targetMp: clamp(targetMp, LIMITS.targetMpMin, LIMITS.targetMpMax),
    quality: clamp(quality, LIMITS.qualityMin, LIMITS.qualityMax),
    profile: "sRGB-implied",
  };
}

/** A patch over a whole value: `jpeg` merges field-wise, everything else swaps. */
function mergeDefaults(base: UploadDefaults, patch: Partial<UploadDefaults>): UploadDefaults {
  return { ...base, ...patch, jpeg: { ...base.jpeg, ...patch.jpeg } };
}

function isUnit(value: unknown): value is LengthUnit {
  return value === "pt" || value === "px" || value === "%";
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
