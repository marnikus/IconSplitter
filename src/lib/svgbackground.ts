// svgbackground.ts — the preview background of the Generate SVG tab (prompt §16).
// Owns: the five presets plus the custom colour, the hex validation every read
// goes through, the stored payload shape the panel restores, and the contrast
// rule that keeps black artwork visible. The colour is applied to the app's
// preview FRAME — the frame carries a colour and an outline flag, nothing else,
// so it can never modify an SVG document, a sidecar or an export.

export type BgPreset = "white" | "black" | "gray" | "green" | "red" | "custom";

export interface PreviewBackground {
  preset: BgPreset;
  /** Only used by the custom preset; always a normalised "#rrggbb". */
  custom: string;
}

export interface BgOption {
  id: Exclude<BgPreset, "custom">;
  label: string;
  color: string;
}

export interface PreviewFrame {
  color: string;
  /** True when the frame needs the light outline around the artwork. */
  outline: boolean;
}

/** WCAG contrast for non-text graphics: below this, black artwork needs help. */
export const CONTRAST_MIN = 3;

export const BG_PRESETS: readonly BgOption[] = [
  { id: "white", label: "White", color: "#ffffff" },
  { id: "black", label: "Black", color: "#000000" },
  { id: "gray", label: "Gray", color: "#808080" },
  { id: "green", label: "Green", color: "#1e7f3c" },
  { id: "red", label: "Red", color: "#c22f2f" },
];

export const DEFAULT_PREVIEW_BACKGROUND: PreviewBackground = { preset: "white", custom: "#808080" };

/** "#AbC" / "abc" / "#aabbcc" -> "#aabbcc"; anything else -> null. */
export function normalizeHex(value: string): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const hex = match[1].toLowerCase();
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  return `#${full}`;
}

/** Validated payload; a broken preset or colour falls back to the default. */
export function parsePreviewBackground(raw: unknown): PreviewBackground {
  if (!isRecord(raw)) return DEFAULT_PREVIEW_BACKGROUND;
  return {
    preset: toPreset(raw.preset),
    custom: customOf(raw.custom),
  };
}

export function resolveBackground(bg: PreviewBackground): string {
  return optionOf(bg.preset)?.color ?? bg.custom;
}

export function backgroundLabel(bg: PreviewBackground): string {
  return optionOf(bg.preset)?.label ?? `Custom ${bg.custom}`;
}

/** One preset click: the colour changes, the remembered custom value stays. */
export function selectPreset(bg: PreviewBackground, id: Exclude<BgPreset, "custom">): PreviewBackground {
  return { preset: id, custom: bg.custom };
}

/** One custom pick: a value that is not a colour keeps the previous one. */
export function selectCustom(bg: PreviewBackground, value: string): PreviewBackground {
  return { preset: "custom", custom: normalizeHex(value) ?? bg.custom };
}

/** The frame the preview renders inside: background colour + outline decision. */
export function previewFrame(bg: PreviewBackground): PreviewFrame {
  const color = resolveBackground(bg);
  return { color, outline: contrastWithBlack(color) < CONTRAST_MIN };
}

/** WCAG contrast ratio between the colour and black, 1 .. 21. */
export function contrastWithBlack(color: string): number {
  return (relativeLuminance(color) + 0.05) / 0.05;
}

/** sRGB relative luminance (0 black .. 1 white); an invalid colour is black. */
export function relativeLuminance(color: string): number {
  const hex = normalizeHex(color);
  if (hex === null) return 0;
  const [r, g, b] = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function toLinear(channel: number): number {
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function optionOf(id: BgPreset): BgOption | undefined {
  return BG_PRESETS.find((p) => p.id === id);
}

function toPreset(value: unknown): BgPreset {
  const known = BG_PRESETS.some((p) => p.id === value) || value === "custom";
  return known ? (value as BgPreset) : DEFAULT_PREVIEW_BACKGROUND.preset;
}

function customOf(value: unknown): string {
  return normalizeHex(typeof value === "string" ? value : "") ?? DEFAULT_PREVIEW_BACKGROUND.custom;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
