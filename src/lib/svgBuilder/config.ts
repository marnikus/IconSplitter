// config.ts — the sheet's validated configuration and three reproducible
// presets. Every persisted value is rebuilt field by field (RULE 13); a corrupt
// field costs its default, never a broken artboard.
import { fnv1a32 } from "../pairing";
import { isRecord } from "../isrecord";
import type { BannerPosition, CaptionCase, SheetConfig, TitleFace } from "./types";

const HEX = /^#[0-9a-f]{6}$/i;
const MODES: readonly SelectionMode[] = ["similar", "random", "filtered"];

export const DEFAULT_CONFIG: SheetConfig = {
  artboard: { width: 1080, height: 660, background: "#F4F0E7", padding: 56, radius: 28 },
  grid: { columns: 7, rows: 4, gapX: 30, gapY: 34, captions: true,
    captionColor: "#6B6458", captionSize: 11, captionCase: "upper" },
  icons: { box: 72, strokeWidth: 1.8, color: "#24362A", linecap: "round" },
  banner: { position: "left", size: 280, background: "#17271F", accent: "#D9F36C",
    textColor: "#F4F0E7", subtitleColor: "#C9D2C4", style: "split",
    title: "GLYPH / ICON SHEET", subtitle: "Approved SVG assets",
    titleSize: 34, subtitleSize: 13, titleFace: "sans", hero: true,
    heroIconId: null, divider: true },
};

export interface SheetPresetOption { id: string; label: string; config: SheetConfig }

export const PRESETS: readonly SheetPresetOption[] = [
  { id: "classic", label: "Classic grid", config: DEFAULT_CONFIG },
  { id: "dark", label: "Dark artboard", config: {
    ...DEFAULT_CONFIG,
    artboard: { ...DEFAULT_CONFIG.artboard, background: "#111A24" },
    grid: { ...DEFAULT_CONFIG.grid, captionColor: "#A9B4C0" },
    icons: { ...DEFAULT_CONFIG.icons, color: "#E7EEF5" },
    banner: { ...DEFAULT_CONFIG.banner, background: "#0A1119", textColor: "#F0F5FA" },
  } },
  { id: "contact", label: "Contact sheet", config: {
    ...DEFAULT_CONFIG,
    artboard: { ...DEFAULT_CONFIG.artboard, width: 1280, height: 820, padding: 40 },
    grid: { ...DEFAULT_CONFIG.grid, columns: 9, rows: 5, gapX: 18, gapY: 22, captions: false },
    icons: { ...DEFAULT_CONFIG.icons, box: 58 },
    banner: { ...DEFAULT_CONFIG.banner, position: "top", size: 108, titleSize: 26 },
  } },
];

type SelectionMode = "similar" | "random" | "filtered";

export function parseSheetConfig(raw: unknown): SheetConfig {
  if (!isRecord(raw)) return copyConfig(DEFAULT_CONFIG);
  return {
    artboard: parseArtboard(raw.artboard),
    grid: parseGrid(raw.grid),
    icons: parseIcons(raw.icons),
    banner: parseBanner(raw.banner),
  };
}

export function copyConfig(c: SheetConfig): SheetConfig {
  return {
    artboard: { ...c.artboard }, grid: { ...c.grid }, icons: { ...c.icons }, banner: { ...c.banner },
  };
}

export function configFingerprint(config: SheetConfig): string {
  return fnv1a32(JSON.stringify(config)).toString(16);
}

export function readableInk(background: string): string {
  const hex = HEX.test(background) ? background.slice(1) : "000000";
  const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lum = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const brightness = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
  return brightness > 0.45 ? "#1D2621" : "#F0F5F2";
}

function parseArtboard(raw: unknown): SheetConfig["artboard"] {
  const d = DEFAULT_CONFIG.artboard;
  if (!isRecord(raw)) return { ...d };
  return {
    width: num(raw.width, d.width, 320, 4096), height: num(raw.height, d.height, 240, 4096),
    background: hex(raw.background, d.background), padding: num(raw.padding, d.padding, 0, 160),
    radius: num(raw.radius, d.radius, 0, 80),
  };
}

function parseGrid(raw: unknown): SheetConfig["grid"] {
  const d = DEFAULT_CONFIG.grid;
  if (!isRecord(raw)) return { ...d };
  return {
    columns: num(raw.columns, d.columns, 1, 20), rows: num(raw.rows, d.rows, 1, 20),
    gapX: num(raw.gapX, d.gapX, 0, 120), gapY: num(raw.gapY, d.gapY, 0, 120),
    captions: bool(raw.captions, d.captions), captionColor: hex(raw.captionColor, d.captionColor),
    captionSize: num(raw.captionSize, d.captionSize, 6, 32),
    captionCase: oneOf(raw.captionCase, ["upper", "normal"], d.captionCase) as CaptionCase,
  };
}

function parseIcons(raw: unknown): SheetConfig["icons"] {
  const d = DEFAULT_CONFIG.icons;
  if (!isRecord(raw)) return { ...d };
  return {
    box: num(raw.box, d.box, 16, 240), strokeWidth: num(raw.strokeWidth, d.strokeWidth, 0.25, 12),
    color: hex(raw.color, d.color),
    linecap: oneOf(raw.linecap, ["round", "square"], d.linecap) as "round" | "square",
  };
}

interface BannerParts {
  numbers: Pick<SheetConfig["banner"], "size" | "titleSize" | "subtitleSize">;
  colours: Pick<SheetConfig["banner"], "background" | "accent" | "textColor" | "subtitleColor">;
  words: Pick<SheetConfig["banner"], "title" | "subtitle">;
}

function parseBanner(raw: unknown): SheetConfig["banner"] {
  const d = DEFAULT_CONFIG.banner;
  if (!isRecord(raw)) return { ...d };
  const parts: BannerParts = { numbers: bannerNumbers(raw, d), colours: bannerColours(raw, d), words: bannerWords(raw, d) };
  return {
    ...parts.numbers, ...parts.colours, ...parts.words,
    position: oneOf(raw.position, ["left", "right", "top", "bottom", "none"], d.position) as BannerPosition,
    style: oneOf(raw.style, ["solid", "split"], d.style) as "solid" | "split",
    titleFace: oneOf(raw.titleFace, ["sans", "serif", "mono"], d.titleFace) as TitleFace,
    hero: bool(raw.hero, d.hero), divider: bool(raw.divider, d.divider),
    heroIconId: typeof raw.heroIconId === "string" ? raw.heroIconId : null,
  };
}

function bannerNumbers(raw: Record<string, unknown>, d: SheetConfig["banner"]): BannerParts["numbers"] {
  return { size: num(raw.size, d.size, 0, 500), titleSize: num(raw.titleSize, d.titleSize, 10, 96),
    subtitleSize: num(raw.subtitleSize, d.subtitleSize, 8, 48) };
}

function bannerColours(raw: Record<string, unknown>, d: SheetConfig["banner"]): BannerParts["colours"] {
  return { background: hex(raw.background, d.background), accent: hex(raw.accent, d.accent),
    textColor: hex(raw.textColor, d.textColor), subtitleColor: hex(raw.subtitleColor, d.subtitleColor) };
}

function bannerWords(raw: Record<string, unknown>, d: SheetConfig["banner"]): BannerParts["words"] {
  return { title: text(raw.title, d.title, 90), subtitle: text(raw.subtitle, d.subtitle, 140) };
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

function text(value: unknown, fallback: string, max: number): string {
  return typeof value === "string" && value.trim() !== "" && value.length <= max ? value : fallback;
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

/** Kept here so config and selection share the exact allowed mode names. */
export function isSelectionMode(value: unknown): value is SelectionMode {
  return typeof value === "string" && MODES.includes(value as SelectionMode);
}
