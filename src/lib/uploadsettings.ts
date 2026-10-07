// uploadsettings.ts — the export settings, their defaults and their limits
// (RULE 16). Owns: the shape, the default board from the brief, the clamping
// that makes a stored payload safe, and the validation messages the panel shows.
//
// Every numeric bound lives here once; the UI reads it, the parser enforces it
// and export.json records the value that was actually used.

import { DEFAULT_DPI, formatStroke, STROKE_UNITS, type StrokeUnit } from "./uploadunits";

export type ColorProfile = "srgb" | "display-p3";

export interface UploadSettings {
  /** Board margin on each side, as a percentage of the icon's own size. */
  paddingPct: number;
  /** How much of the board the icon fills (100% = fills the padded board). */
  iconScalePct: number;
  /** Plate colour: the JPEG's opaque background and the SVG plate when enabled. */
  background: string;
  /** Explicit output policy: is the plate painted into the exported SVG too? */
  backgroundInSvg: boolean;
  /** Stroke width applied to the export copy, in `strokeUnit`. 0 = keep source. */
  strokeWidth: number;
  strokeUnit: StrokeUnit;
  /** JPEG target, in megapixels. The achieved value is reported, never assumed. */
  targetMP: number;
  jpegQuality: number;
  colorProfile: ColorProfile;
  /** Run SVGO on the export copy. */
  optimizeSvg: boolean;
  includeEps: boolean;
  /** Pixels per inch used for every pt/mm/in conversion. */
  dpi: number;
  /** Square board (the default). When off the board keeps the artwork's aspect. */
  square: boolean;
}

export const DEFAULT_UPLOAD_SETTINGS: UploadSettings = {
  paddingPct: 10,
  iconScalePct: 100,
  background: "#ffffff",
  backgroundInSvg: false,
  strokeWidth: 2.2,
  strokeUnit: "pt",
  targetMP: 15.1,
  jpegQuality: 0.92,
  colorProfile: "srgb",
  optimizeSvg: true,
  includeEps: false,
  dpi: DEFAULT_DPI,
  square: true,
};

export const PADDING_MIN = 0;
export const PADDING_MAX = 40;
export const SCALE_MIN = 10;
export const SCALE_MAX = 100;
export const MP_MIN = 0.1;
export const MP_MAX = 60;
export const QUALITY_MIN = 0.4;
export const QUALITY_MAX = 1;
export const DPI_MIN = 72;
export const DPI_MAX = 600;
export const STROKE_MIN = 0;
export const STROKE_MAX = 100;

export const SETTING_FIELDS: readonly (keyof UploadSettings)[] = [
  "paddingPct", "iconScalePct", "background", "backgroundInSvg",
  "strokeWidth", "strokeUnit", "targetMP", "jpegQuality", "colorProfile",
  "optimizeSvg", "includeEps", "dpi", "square",
];

export function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** A stored or overridden payload is untrusted: every field is re-derived. */
export function parseUploadSettings(raw: unknown): UploadSettings {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_UPLOAD_SETTINGS };
  const value = raw as Record<string, unknown>;
  const number = (key: keyof UploadSettings, fallback: number, min: number, max: number): number =>
    typeof value[key] === "number" ? clampNumber(value[key] as number, min, max, fallback) : fallback;
  const unit = STROKE_UNITS.includes(value.strokeUnit as StrokeUnit) ? (value.strokeUnit as StrokeUnit) : DEFAULT_UPLOAD_SETTINGS.strokeUnit;
  return {
    paddingPct: number("paddingPct", DEFAULT_UPLOAD_SETTINGS.paddingPct, PADDING_MIN, PADDING_MAX),
    iconScalePct: number("iconScalePct", DEFAULT_UPLOAD_SETTINGS.iconScalePct, SCALE_MIN, SCALE_MAX),
    background: normalizeHex(value.background) ?? DEFAULT_UPLOAD_SETTINGS.background,
    backgroundInSvg: typeof value.backgroundInSvg === "boolean" ? value.backgroundInSvg : DEFAULT_UPLOAD_SETTINGS.backgroundInSvg,
    strokeWidth: number("strokeWidth", DEFAULT_UPLOAD_SETTINGS.strokeWidth, STROKE_MIN, STROKE_MAX),
    strokeUnit: unit,
    targetMP: number("targetMP", DEFAULT_UPLOAD_SETTINGS.targetMP, MP_MIN, MP_MAX),
    jpegQuality: number("jpegQuality", DEFAULT_UPLOAD_SETTINGS.jpegQuality, QUALITY_MIN, QUALITY_MAX),
    colorProfile: value.colorProfile === "display-p3" ? "display-p3" : "srgb",
    optimizeSvg: typeof value.optimizeSvg === "boolean" ? value.optimizeSvg : DEFAULT_UPLOAD_SETTINGS.optimizeSvg,
    includeEps: typeof value.includeEps === "boolean" ? value.includeEps : DEFAULT_UPLOAD_SETTINGS.includeEps,
    dpi: number("dpi", DEFAULT_UPLOAD_SETTINGS.dpi, DPI_MIN, DPI_MAX),
    square: typeof value.square === "boolean" ? value.square : DEFAULT_UPLOAD_SETTINGS.square,
  };
}

/** "#a1b2c3" or "#abc" → "#a1b2c3"; anything else → null, never a guess. */
export function normalizeHex(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const hex = raw.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(hex)) return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  return /^#[0-9a-f]{6}$/.test(hex) ? hex : null;
}

/** Serialise: the exact fields, so a round-trip cannot drop a new one (RULE 23). */
export function serializeSettings(settings: UploadSettings): UploadSettings {
  return parseUploadSettings(settings);
}

export interface SettingIssue {
  field: keyof UploadSettings;
  message: string;
}

/** Field-accurate messages: the panel shows them beside the field, never as one blob. */
export function settingIssues(settings: UploadSettings): SettingIssue[] {
  const issues: SettingIssue[] = [];
  const check = (field: keyof UploadSettings, ok: boolean, message: string): void => {
    if (!ok) issues.push({ field, message });
  };
  check("paddingPct", range(settings.paddingPct, PADDING_MIN, PADDING_MAX), `padding must be ${PADDING_MIN}–${PADDING_MAX}%`);
  check("iconScalePct", range(settings.iconScalePct, SCALE_MIN, SCALE_MAX), `icon scale must be ${SCALE_MIN}–${SCALE_MAX}%`);
  check("background", normalizeHex(settings.background) !== null, "background must be a #rrggbb colour");
  check("strokeWidth", range(settings.strokeWidth, STROKE_MIN, STROKE_MAX), `stroke width must be ${STROKE_MIN}–${STROKE_MAX} ${settings.strokeUnit}`);
  check("targetMP", range(settings.targetMP, MP_MIN, MP_MAX), `JPEG target must be ${MP_MIN}–${MP_MAX} MP`);
  check("jpegQuality", range(settings.jpegQuality, QUALITY_MIN, QUALITY_MAX), `quality must be ${QUALITY_MIN}–${QUALITY_MAX}`);
  check("dpi", range(settings.dpi, DPI_MIN, DPI_MAX), `DPI must be ${DPI_MIN}–${DPI_MAX}`);
  return issues;
}

function range(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

/** The one-line summary the row and the panel both show. */
export function settingsSummary(s: UploadSettings): string {
  const stroke = s.strokeWidth > 0 ? formatStroke(s.strokeWidth, s.strokeUnit) : "source stroke";
  return `${stroke} · ${trimNumber(s.paddingPct)}% pad · ${s.targetMP} MP · q${trimNumber(s.jpegQuality * 100)}`;
}

/** Where the plate is painted, in words — used by the panel and by export.json. */
export function backgroundPolicyText(s: UploadSettings): string {
  const where = s.backgroundInSvg ? "SVG + JPEG" : "JPEG only";
  return `${s.background} (${where})`;
}

export function trimNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}
