// config.ts — the sheet's validated configuration and the reference's three
// layout presets. Every persisted value is rebuilt field by field (RULE 13):
// numbers are CLAMPED to the one range table, never reverted to a default.
import { fnv1a32 } from "../pairing";
import { isRecord } from "../isrecord";
import { RANGES, clampTo, type NumRange } from "./ranges";
import type { BannerPosition, CaptionCase, SelectionMode, SheetConfig, TitleFace } from "./types";

const HEX = /^#[0-9a-f]{6}$/i;
const MODES: readonly SelectionMode[] = ["similar", "random", "filtered"];

/** Reference "Glyph" defaults (FIXES §D); the banner copy is neutral, not "FOOD ICONS". */
export const DEFAULT_CONFIG: SheetConfig = {
  artboard: { width: 1080, height: 660, background: "#F4F0E7", padding: 34, radius: 0 },
  grid: { columns: 8, rows: 4, gapX: 22, gapY: 18, captions: true,
    captionColor: "#787A6C", captionSize: 9, captionCase: "upper" },
  icons: { box: 52, strokeWidth: 1.4, color: "#202A24", linecap: "round" },
  banner: { position: "left", size: 242, background: "#17271F", accent: "#D9F36C",
    textColor: "#FBFAF6", subtitleColor: "#CBD6C8", style: "solid",
    title: "ICON SHEET", subtitle: "Editable stroke width",
    titleSize: 32, subtitleSize: 9, titleFace: "sans", hero: true, heroIconId: null, divider: true },
};

/** The 8 swatches shown under Canvas and Stroke colour. */
export const SWATCHES: readonly string[] = ["#17271F", "#202A24", "#3D5A44", "#D9F36C", "#F4F0E7", "#FBFAF6", "#E7B37C", "#C96B4B"];

export type LayoutPresetId = "editorial" | "masthead" | "plain";
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
];

/** A preset resets every value of its groups to the defaults + its patch, keeping the user's banner copy and hero. */
export function applyPresetConfig(current: SheetConfig, id: LayoutPresetId): SheetConfig {
  const preset = LAYOUT_PRESETS.find((p) => p.id === id) ?? LAYOUT_PRESETS[0];
  return applyCopy(preset.patch(copyConfig(DEFAULT_CONFIG)), current);
}

/** A look (preset or saved template) on the current sheet: its banner words and hero are kept. */
export function applyCopy(look: SheetConfig, current: SheetConfig): SheetConfig {
  const { title, subtitle, heroIconId } = current.banner;
  return parseSheetConfig({ ...look, banner: { ...look.banner, title, subtitle, heroIconId } });
}

export function parseSheetConfig(raw: unknown): SheetConfig {
  if (!isRecord(raw)) return copyConfig(DEFAULT_CONFIG);
  return { artboard: parseArtboard(raw.artboard), grid: parseGrid(raw.grid), icons: parseIcons(raw.icons), banner: parseBanner(raw.banner) };
}

export function copyConfig(c: SheetConfig): SheetConfig {
  return { artboard: { ...c.artboard }, grid: { ...c.grid }, icons: { ...c.icons }, banner: { ...c.banner } };
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
  return { width: num(RANGES.width, raw.width, d.width), height: num(RANGES.height, raw.height, d.height),
    background: hex(raw.background, d.background), padding: num(RANGES.padding, raw.padding, d.padding),
    radius: num(RANGES.radius, raw.radius, d.radius) };
}

function parseGrid(raw: unknown): SheetConfig["grid"] {
  const d = DEFAULT_CONFIG.grid;
  if (!isRecord(raw)) return { ...d };
  return { columns: num(RANGES.columns, raw.columns, d.columns), rows: num(RANGES.rows, raw.rows, d.rows),
    gapX: num(RANGES.gapX, raw.gapX, d.gapX), gapY: num(RANGES.gapY, raw.gapY, d.gapY),
    captions: bool(raw.captions, d.captions), captionColor: hex(raw.captionColor, d.captionColor),
    captionSize: num(RANGES.captionSize, raw.captionSize, d.captionSize),
    captionCase: oneOf(raw.captionCase, ["upper", "normal"], d.captionCase) as CaptionCase };
}

function parseIcons(raw: unknown): SheetConfig["icons"] {
  const d = DEFAULT_CONFIG.icons;
  if (!isRecord(raw)) return { ...d };
  return { box: num(RANGES.box, raw.box, d.box), strokeWidth: num(RANGES.strokeWidth, raw.strokeWidth, d.strokeWidth),
    color: hex(raw.color, d.color), linecap: oneOf(raw.linecap, ["round", "square"], d.linecap) as "round" | "square" };
}

function parseBanner(raw: unknown): SheetConfig["banner"] {
  const d = DEFAULT_CONFIG.banner;
  if (!isRecord(raw)) return { ...d };
  return {
    position: oneOf(raw.position, ["left", "right", "top", "bottom", "none"], d.position) as BannerPosition,
    size: num(RANGES.bannerAny, raw.size, d.size), style: oneOf(raw.style, ["solid", "split"], d.style) as "solid" | "split",
    background: hex(raw.background, d.background), accent: hex(raw.accent, d.accent),
    textColor: hex(raw.textColor, d.textColor), subtitleColor: hex(raw.subtitleColor, d.subtitleColor),
    title: text(raw.title, d.title, 90), subtitle: text(raw.subtitle, d.subtitle, 140),
    titleSize: num(RANGES.titleSize, raw.titleSize, d.titleSize), subtitleSize: num(RANGES.subtitleSize, raw.subtitleSize, d.subtitleSize),
    titleFace: oneOf(raw.titleFace, ["sans", "serif", "mono"], d.titleFace) as TitleFace,
    hero: bool(raw.hero, d.hero), divider: bool(raw.divider, d.divider),
    heroIconId: typeof raw.heroIconId === "string" && raw.heroIconId !== "" ? raw.heroIconId : null,
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
