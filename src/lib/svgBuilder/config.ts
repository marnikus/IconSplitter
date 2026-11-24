// config.ts — the sheet's validated configuration and the reference's three
// layout presets. Every persisted value is rebuilt field by field (RULE 13):
// numbers are CLAMPED to the one range table, never reverted to a default.
import { fnv1a32 } from "../pairing";
import { isRecord } from "../isrecord";
import { RANGES, clampTo, type NumRange } from "./ranges";
import { parseMerges } from "./merges";
import { foldPad, parsePadSides } from "./padsides";
import type { BannerPosition, BannerStyle, CaptionCase, SelectionMode, SheetConfig, TitleFace , TextCase } from "./types";

const HEX = /^#[0-9a-f]{6}$/i;
const MODES: readonly SelectionMode[] = ["similar", "random", "filtered"];

/** Reference "Glyph" defaults (FIXES §D); the banner copy is neutral, not "FOOD ICONS". */
export const DEFAULT_CONFIG: SheetConfig = {
  artboard: { width: 1080, height: 660, background: "#F4F0E7", padding: 34, radius: 0, padSides: null },
  grid: { columns: 8, rows: 4, gapX: 22, gapY: 18, captions: true, merges: [],
    captionColor: "#787A6C", captionSize: 9, captionCase: "upper", captionGap: 0 },
  icons: { box: 52, strokeWidth: 1.4, color: "#202A24", linecap: "round", coloredStroke: "", coloredStrokeWidth: 0, coloredFill: "" },
  banner: { position: "left", size: 242, background: "#17271F", accent: "#D9F36C",
    textColor: "#FBFAF6", subtitleColor: "#CBD6C8", style: "solid", lineWidth: 1.5, lineColor: "#E8C547",
    title: "ICON SHEET", subtitle: "Editable stroke width",
    titleSize: 32, subtitleSize: 9, titleFace: "sans", hero: true, heroIconId: null, divider: true,
    textPadding: 0, titleDx: 0, titleDy: 0, subtitleDx: 0, subtitleDy: 0,
    heroScale: 100, heroStroke: 1.1, ringScale: 100, ringStroke: 1, captionTexts: {}, titleWidth: 0, subtitleWidth: 0, edgeSpread: false, titleCase: "normal", subtitleCase: "upper", autoRebalance: true, rowGapPct: 5, titleFillPct: 55, subRatioPct: 42, titleTracking: 0, subtitleTracking: 0 },
};

/** The 8 swatches shown under Canvas and Stroke colour. */
export const SWATCHES: readonly string[] = ["#17271F", "#202A24", "#3D5A44", "#D9F36C", "#F4F0E7", "#FBFAF6", "#E7B37C", "#C96B4B"];

export type LayoutPresetId = "editorial" | "masthead" | "plain" | "line";
export interface LayoutPreset { id: LayoutPresetId; label: string; hint: string; patch: (d: SheetConfig) => SheetConfig }

export const LAYOUT_PRESETS: readonly LayoutPreset[] = [
  { id: "editorial", label: "Side banner", hint: "Editorial collection", patch: (d) => d },
  { id: "masthead", label: "Top split", hint: "Dense catalogue", patch: (d) => ({
    artboard: { ...d.artboard, height: 640, padding: 30 },
    grid: { ...d.grid, columns: 10, rows: 5, gapX: 16, gapY: 12, captions: false, captionSize: 7 },
    icons: { ...d.icons, box: 42, strokeWidth: 1.5 },
    banner: { ...d.banner, position: "top", style: "split", size: 76, hero: false, titleSize: 27, subtitleSize: 22 },
  }) },
  { id: "plain", label: "Plain grid", hint: "Clean contact sheet", patch: (d) => ({
    artboard: { ...d.artboard, height: 560, background: "#FBFAF6", padding: 46 },
    grid: { ...d.grid, columns: 8, rows: 3, gapX: 30, gapY: 26, captions: false },
    icons: { ...d.icons, box: 58, strokeWidth: 1.8 },
    banner: { ...d.banner, position: "none" },
  }) },
  // 2026-11-23: no banner colour — the words sit on the canvas under one separator line
  { id: "line", label: "Line banner", hint: "Words on the canvas under one line", patch: (d) => ({
    artboard: { ...d.artboard, height: 600, background: "#FDF8E8", padding: 40 },
    grid: { ...d.grid, columns: 7, rows: 3, gapX: 30, gapY: 26, captions: false },
    icons: { ...d.icons, box: 64, strokeWidth: 1.6, color: "#4A3B1F" },
    banner: { ...d.banner, position: "bottom", style: "line", size: 76, hero: false, divider: false,
      textColor: "#4A3B1F", subtitleColor: "#4A3B1F", lineColor: "#E8C547", lineWidth: 1.5 },
  }) },
];

/** A preset resets every value of its groups to the defaults + its patch, keeping the user's banner copy and hero. */
export function applyPresetConfig(current: SheetConfig, id: LayoutPresetId): SheetConfig {
  const preset = LAYOUT_PRESETS.find((p) => p.id === id) ?? LAYOUT_PRESETS[0];
  return applyCopy(preset.patch(copyConfig(DEFAULT_CONFIG)), current);
}

/** What a layout button may change on an open template: the banner type… */
const BANNER_TYPE_KEYS = ["position", "style", "size", "hero", "divider"] as const;
/** …and the text placement, reset so the words are placed afresh for that banner. */
const TEXT_PLACEMENT_KEYS = ["textPadding", "titleDx", "titleDy", "subtitleDx", "subtitleDy", "titleWidth", "subtitleWidth", "edgeSpread"] as const;

/**
 * A layout button on an open template or artboard (2026-11-24): only the banner
 * type changes and the text is placed afresh; colours, font family, text sizes,
 * tracking, grid, icons and artboard stay the template's own.
 */
export function applyPresetLayoutOnly(current: SheetConfig, id: LayoutPresetId): SheetConfig {
  const look = applyPresetConfig(current, id).banner;
  const pick = (src: SheetConfig["banner"], keys: readonly (keyof SheetConfig["banner"])[]) => Object.fromEntries(keys.map((k) => [k, src[k]]));
  const banner = { ...current.banner, ...pick(look, BANNER_TYPE_KEYS), ...pick(DEFAULT_CONFIG.banner, TEXT_PLACEMENT_KEYS) };
  return parseSheetConfig({ ...copyConfig(current), banner });
}

/** A look (preset or saved template) on the current sheet: its banner words and hero are kept. */
export function applyCopy(look: SheetConfig, current: SheetConfig): SheetConfig {
  const { title, subtitle, heroIconId, captionTexts } = current.banner;
  return parseSheetConfig({ ...look, banner: { ...look.banner, title, subtitle, heroIconId, captionTexts } });
}

export function parseSheetConfig(raw: unknown): SheetConfig {
  if (!isRecord(raw)) return copyConfig(DEFAULT_CONFIG);
  return { artboard: parseArtboard(raw.artboard), grid: parseGrid(raw.grid), icons: parseIcons(raw.icons), banner: parseBanner(raw.banner) };
}

export function copyConfig(c: SheetConfig): SheetConfig {
  return { artboard: { ...c.artboard, padSides: c.artboard.padSides === null ? null : { ...c.artboard.padSides } }, grid: { ...c.grid, merges: c.grid.merges.map((m) => ({ ...m })) }, icons: { ...c.icons }, banner: { ...c.banner, captionTexts: { ...c.banner.captionTexts } } };
}

export function configFingerprint(config: SheetConfig): string {
  return fnv1a32(JSON.stringify(config)).toString(16);
}

/** Reference split-masthead contrast: dark ink on a light accent, white on a dark one. */
export function readableInk(background: string): string {
  const hex = HEX.test(background) ? background.slice(1) : "000000";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.46 ? "#1B211D" : "#FFFFFF";
}

function parseArtboard(raw: unknown): SheetConfig["artboard"] {
  const d = DEFAULT_CONFIG.artboard;
  if (!isRecord(raw)) return { ...d };
  const padding = num(RANGES.padding, raw.padding, d.padding);
  return foldPad({ width: num(RANGES.width, raw.width, d.width), height: num(RANGES.height, raw.height, d.height),
    background: hex(raw.background, d.background), padding,
    radius: num(RANGES.radius, raw.radius, d.radius), padSides: parsePadSides(raw.padSides, padding) });
}

function parseGrid(raw: unknown): SheetConfig["grid"] {
  const d = DEFAULT_CONFIG.grid;
  if (!isRecord(raw)) return { ...d, merges: [] };
  return { columns: num(RANGES.columns, raw.columns, d.columns), rows: num(RANGES.rows, raw.rows, d.rows),
    gapX: num(RANGES.gapX, raw.gapX, d.gapX), gapY: num(RANGES.gapY, raw.gapY, d.gapY),
    captions: bool(raw.captions, d.captions), captionColor: hex(raw.captionColor, d.captionColor),
    captionSize: num(RANGES.captionSize, raw.captionSize, d.captionSize),
    captionCase: oneOf(raw.captionCase, ["upper", "normal"], d.captionCase) as CaptionCase,
    captionGap: num(RANGES.captionGap, raw.captionGap, d.captionGap), merges: parseMerges(raw.merges) };
}

function parseIcons(raw: unknown): SheetConfig["icons"] {
  const d = DEFAULT_CONFIG.icons;
  if (!isRecord(raw)) return { ...d };
  return { box: num(RANGES.box, raw.box, d.box), strokeWidth: num(RANGES.strokeWidth, raw.strokeWidth, d.strokeWidth),
    color: hex(raw.color, d.color), linecap: oneOf(raw.linecap, ["round", "square"], d.linecap) as "round" | "square",
    coloredStroke: hex(raw.coloredStroke, ""), coloredStrokeWidth: ownWidth(raw.coloredStrokeWidth), coloredFill: hex(raw.coloredFill, "") };
}

/** A colored-icon stroke width (2026-11-23): 0 (or anything not a positive number) = each icon's own; else clamped to the stroke range. */
function ownWidth(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? clampTo(RANGES.strokeWidth, value) : 0;
}

const CASES = ["normal", "capitalized", "upper"];

function parseBanner(raw: unknown): SheetConfig["banner"] {
  const d = DEFAULT_CONFIG.banner;
  if (!isRecord(raw)) return { ...d };
  return {
    position: oneOf(raw.position, ["left", "right", "top", "bottom", "none"], d.position) as BannerPosition,
    size: num(RANGES.bannerAny, raw.size, d.size), style: oneOf(raw.style, ["solid", "split", "line"], d.style) as BannerStyle,
    lineWidth: num(RANGES.lineWidth, raw.lineWidth, d.lineWidth), lineColor: hex(raw.lineColor, d.lineColor),
    background: hex(raw.background, d.background), accent: hex(raw.accent, d.accent),
    textColor: hex(raw.textColor, d.textColor), subtitleColor: hex(raw.subtitleColor, d.subtitleColor),
    title: text(raw.title, d.title, 90), subtitle: text(raw.subtitle, d.subtitle, 140),
    titleSize: num(RANGES.titleSize, raw.titleSize, d.titleSize), subtitleSize: num(RANGES.subtitleSize, raw.subtitleSize, d.subtitleSize),
    titleFace: oneOf(raw.titleFace, ["sans", "serif", "mono"], d.titleFace) as TitleFace,
    hero: bool(raw.hero, d.hero), divider: bool(raw.divider, d.divider),
    heroIconId: typeof raw.heroIconId === "string" && raw.heroIconId !== "" ? raw.heroIconId : null,
    ...parseTextPlacement(raw),
    ...parseHeroStyle(raw),
    captionTexts: parseCaptionTexts(raw.captionTexts),
    titleWidth: num(RANGES.textWidth, raw.titleWidth, d.titleWidth), subtitleWidth: num(RANGES.textWidth, raw.subtitleWidth, d.subtitleWidth),
    edgeSpread: bool(raw.edgeSpread, d.edgeSpread),
    autoRebalance: bool(raw.autoRebalance, d.autoRebalance),
    rowGapPct: num(RANGES.rowGapPct, raw.rowGapPct, d.rowGapPct), titleFillPct: num(RANGES.titleFillPct, raw.titleFillPct, d.titleFillPct),
    subRatioPct: num(RANGES.subRatioPct, raw.subRatioPct, d.subRatioPct),
    titleTracking: num(RANGES.tracking, raw.titleTracking, d.titleTracking), subtitleTracking: num(RANGES.tracking, raw.subtitleTracking, d.subtitleTracking),
    titleCase: oneOf(raw.titleCase, CASES, d.titleCase) as TextCase, subtitleCase: oneOf(raw.subtitleCase, CASES, d.subtitleCase) as TextCase,
  };
}

/** Typed captions: icon id → non-empty words (at most 400, 60 characters each); junk drops. */
export function parseCaptionTexts(raw: unknown): Record<string, string> {
  if (!isRecord(raw)) return {};
  const entries = Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string" && e[1].trim() !== "");
  return Object.fromEntries(entries.slice(0, 400).map(([id, words]) => [id.slice(0, 120), words.slice(0, 60)]));
}

type HeroStyle = Pick<SheetConfig["banner"], "heroScale" | "heroStroke" | "ringScale" | "ringStroke">;

/** Hero style: missing on older configs → the reference look (100 %, 1.1 px, 100 %, 1 px). */
function parseHeroStyle(raw: Record<string, unknown>): HeroStyle {
  const d = DEFAULT_CONFIG.banner;
  return {
    heroScale: num(RANGES.heroScale, raw.heroScale, d.heroScale), heroStroke: num(RANGES.heroStroke, raw.heroStroke, d.heroStroke),
    ringScale: num(RANGES.ringScale, raw.ringScale, d.ringScale), ringStroke: num(RANGES.ringStroke, raw.ringStroke, d.ringStroke),
  };
}

type TextPlacement = Pick<SheetConfig["banner"], "textPadding" | "titleDx" | "titleDy" | "subtitleDx" | "subtitleDy">;

/** Text placement: missing on older configs and presets -> 0 (the reference placement). */
function parseTextPlacement(raw: Record<string, unknown>): TextPlacement {
  const move = (v: unknown) => num(RANGES.textOffset, v, 0);
  return {
    textPadding: num(RANGES.textPadding, raw.textPadding, 0),
    titleDx: move(raw.titleDx), titleDy: move(raw.titleDy), subtitleDx: move(raw.subtitleDx), subtitleDy: move(raw.subtitleDy),
  };
}

function num(range: NumRange, value: unknown, fallback: number): number {
  return clampTo(range, value, fallback);
}

/** Empty text is a real value (an untitled banner); only a non-string falls back. */
function text(value: unknown, fallback: string, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : fallback;
}

function hex(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX.test(value) ? value.toUpperCase() : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function oneOf(value: unknown, allowed: readonly string[], fallback: string): string {
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

export function isSelectionMode(value: unknown): value is SelectionMode {
  return typeof value === "string" && MODES.includes(value as SelectionMode);
}
