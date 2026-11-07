// config.ts — the persisted sheet design, read one field at a time (RULE 13).
// A stored config was written by an older version, or by nobody at all, so every
// field goes through its own clamp/enum/colour reader: one junk field costs that
// FIELD, never the sheet and never a throw. An out-of-range number comes back as
// the nearest usable value (a user who typed 300 wants the maximum, not the
// default), while a value of the wrong TYPE comes back as the field's default —
// there is nothing to clamp a string to.
//
// The reader is deliberately the same one the UI and the undo timeline use, so a
// control, a stored record and an old history entry can never disagree.

import type { BuilderConfig } from "./defaults";
import { DEFAULT_BUILDER_CONFIG } from "./defaults";
import { fnv1a32 } from "../pairing";

/** Every numeric range, in one place — the UI, the reader and the tests share it. */
export const CONFIG_LIMITS = {
  width: { min: 256, max: 4096 },
  height: { min: 256, max: 4096 },
  padding: { min: 0, max: 200 },
  radius: { min: 0, max: 256 },
  columns: { min: 1, max: 16 },
  rows: { min: 1, max: 16 },
  gap: { min: 0, max: 200 },
  box: { min: 8, max: 400 },
  strokeWidth: { min: 0, max: 40 },
  captionSize: { min: 4, max: 40 },
  bannerSize: { min: 0, max: 2048 },
  titleSize: { min: 6, max: 96 },
  subtitleSize: { min: 4, max: 40 },
} as const;

type Section = keyof Pick<BuilderConfig, "artboard" | "grid" | "icons" | "banner" | "export">;

/** The verified default, as a fresh object (never a shared mutable one). */
export function defaultConfigOf(): BuilderConfig {
  return structuredCloneish(DEFAULT_BUILDER_CONFIG);
}

/** Whatever was stored → a config every other module can trust. */
export function parseBuilderConfig(raw: unknown): BuilderConfig {
  const o = readable(raw);
  const artboard = artboardOf(o);
  return { v: 1, artboard, grid: gridOf(o), icons: iconsOf(o), banner: bannerOf(o, artboard), export: exportOf(o) };
}

/**
 * A flat record and a sectioned record are both accepted: the store writes
 * sections, but an undo entry and a hand-written fixture may be flat.
 */
function readable(raw: unknown): Record<string, unknown> {
  const root = asRecord(raw);
  return Object.keys(asRecord(root.artboard)).length > 0 ? mergedFlat(root) : root;
}

/** The grid section: size and captions, each field on its own. */
function gridOf(o: Record<string, unknown>): BuilderConfig["grid"] {
  const d = DEFAULT_BUILDER_CONFIG.grid;
  return {
    columns: int(o.columns, d.columns, CONFIG_LIMITS.columns, "grid"),
    rows: int(o.rows, d.rows, CONFIG_LIMITS.rows, "grid"),
    gapX: int(o.gapX, d.gapX, CONFIG_LIMITS.gap, "grid"),
    gapY: int(o.gapY, d.gapY, CONFIG_LIMITS.gap, "grid"),
    captions: bool(o.captions, d.captions, "grid"),
    captionColor: colour(o.captionColor, d.captionColor, "grid"),
    captionSize: int(o.captionSize, d.captionSize, CONFIG_LIMITS.captionSize, "grid"),
    captionCase: oneOf(o.captionCase, ["upper", "normal"], d.captionCase, "grid"),
  };
}

/** The icons section: the box, the paint and the stroke rule. */
function iconsOf(o: Record<string, unknown>): BuilderConfig["icons"] {
  const d = DEFAULT_BUILDER_CONFIG.icons;
  return {
    box: int(o.box, d.box, CONFIG_LIMITS.box, "icons"),
    strokeWidth: int(o.strokeWidth, d.strokeWidth, CONFIG_LIMITS.strokeWidth, "icons"),
    scaleStroke: bool(o.scaleStroke, d.scaleStroke, "icons"),
    color: colour(o.color, d.color, "icons"),
  };
}

/** The export section: display choices, never part of the fingerprint. */
function exportOf(o: Record<string, unknown>): BuilderConfig["export"] {
  const d = DEFAULT_BUILDER_CONFIG.export;
  return {
    pngScale: oneOf(o.pngScale, [1, 2, 3], d.pngScale, "export"),
    background: oneOf(o.background, ["sheet", "transparent"], d.background, "export"),
  };
}

/** The artboard read first, so the banner can be bounded by the sheet it shares. */
function artboardOf(o: Record<string, unknown>): BuilderConfig["artboard"] {
  const d = DEFAULT_BUILDER_CONFIG.artboard;
  return {
    width: int(o.width, d.width, CONFIG_LIMITS.width, "artboard"),
    height: int(o.height, d.height, CONFIG_LIMITS.height, "artboard"),
    padding: int(o.padding, d.padding, CONFIG_LIMITS.padding, "artboard"),
    radius: int(o.radius, d.radius, CONFIG_LIMITS.radius, "artboard"),
    background: colour(o.background, d.background, "artboard"),
  };
}

/**
 * The banner, read as its own section. A banner is capped so it can never take
 * more than the artboard it shares — the same bound `layout` applies, stated here
 * so a stored 9999 is already honest before it reaches the renderer.
 */
function bannerOf(o: Record<string, unknown>, artboard: BuilderConfig["artboard"]): BuilderConfig["banner"] {
  const d = DEFAULT_BUILDER_CONFIG.banner;
  return {
    position: oneOf(o.position, ["left", "right", "top", "bottom", "none"], d.position, "banner"),
    style: oneOf(o.style, ["solid", "split"], d.style, "banner"),
    size: Math.min(int(o.size, d.size, CONFIG_LIMITS.bannerSize, "banner"), Math.max(artboard.width, artboard.height)),
    background: colour(o.background, d.background, "banner"),
    accent: colour(o.accent, d.accent, "banner"),
    textColor: colour(o.textColor, d.textColor, "banner"),
    subtitleColor: colour(o.subtitleColor, d.subtitleColor, "banner"),
    title: text(o.title, d.title),
    subtitle: text(o.subtitle, d.subtitle),
    titleSize: int(o.titleSize, d.titleSize, CONFIG_LIMITS.titleSize, "banner"),
    subtitleSize: int(o.subtitleSize, d.subtitleSize, CONFIG_LIMITS.subtitleSize, "banner"),
    titleFace: oneOf(o.titleFace, ["sans", "serif", "mono"], d.titleFace, "banner"),
    hero: bool(o.hero, d.hero, "banner"),
    heroIconId: text(o.heroIconId, d.heroIconId),
    divider: bool(o.divider, d.divider, "banner"),
  };
}

/** Sectioned input flattened with the flat keys winning, so both shapes read. */
function mergedFlat(root: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ["artboard", "grid", "icons", "banner", "export"]) {
    Object.assign(out, asRecord(root[key]));
  }
  return { ...out, ...root };
}

/** The stored text of one config: the same shape the reader reads. */
export function serializeBuilderConfig(c: BuilderConfig): string {
  return JSON.stringify(c);
}

/** One control's change: clamp exactly like a stored read, touch nothing else. */
export function withConfigPatch<K extends Section>(
  c: BuilderConfig, section: K, patch: Partial<BuilderConfig[K]>,
): BuilderConfig {
  const merged = { ...c, [section]: { ...c[section], ...patch } };
  // Reading the whole merged config keeps ONE clamp: a control can never be looser
  // than the reader, and a section patch cannot corrupt a neighbour.
  return parseBuilderConfig(merged);
}

/**
 * What the sheet IS, for binding metadata to it: the fields that change the drawn
 * content. Zoom, preview background and the PNG scale are display/export choices,
 * so they are left out — two sheets that draw the same pixels have one fingerprint.
 */
export function configFingerprint(c: BuilderConfig): string {
  const described = {
    artboard: c.artboard,
    // The caption colour paints nothing the sheet describes; it is a display choice.
    grid: { columns: c.grid.columns, rows: c.grid.rows, gapX: c.grid.gapX, gapY: c.grid.gapY, captions: c.grid.captions, captionSize: c.grid.captionSize, captionCase: c.grid.captionCase },
    icons: c.icons,
    banner: c.banner,
  };
  // Sorted keys: the same sheet parsed and built by hand must hash the same.
  return fnv1a32(canonical(described)).toString(16);
}

/** JSON with object keys sorted, so the fingerprint depends on values only. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  const pairs = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
  return `{${pairs.join(",")}}`;
}

/** A record, or an empty one — a non-object config costs every default, never a throw. */
function asRecord(raw: unknown): Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

/** A finite number clamped to [min, max]; junk of the wrong type → the default. */
function int(value: unknown, fallback: number, range: { min: number; max: number }, _section: Section): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(range.min, Math.min(range.max, Math.round(value)));
}

/** A boolean, or the default when it is not one. */
function bool(value: unknown, fallback: boolean, _section: Section): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** A member of `allowed`, or the default — an unknown member is never guessed. */
function oneOf<T>(value: unknown, allowed: readonly T[], fallback: T, _section: Section): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** A colour this app can draw with: `#rgb`, `#rrggbb`, `#rrggbbaa`, or `transparent`. */
function colour(value: unknown, fallback: string, _section: Section): string {
  if (typeof value !== "string") return fallback;
  const text = value.trim().toLowerCase();
  if (text === "transparent") return text;
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(text) ? text : fallback;
}

/** Plain text, trimmed and length-capped so a giant paste cannot bloat the store. */
function text(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.slice(0, 200) : fallback;
}

/** A deep copy with no shared references (the default config is a constant). */
function structuredCloneish<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
