// templates.ts — saved sheet templates of the SVG builder (2026-11-13). A
// template is the sheet's LOOK: the icon grid, icon style, banner style and text
// style — plus SAMPLE banner words (2026-11-14), so the template shows how its
// text looks while it is styled and in its block. Final artboards never use the
// sample: they draw their own words (artboards.ts). No hero icon is kept.
// Pure: validation on read (RULE 13), names, apply and the block's preview.
import { isRecord } from "../isrecord";
import { DEFAULT_CONFIG, applyCopy, copyConfig, parseSheetConfig } from "./config";
import { composeSheet } from "./compose";
import { computeLayout } from "./layout";
import { round } from "./markup";
import type { BuilderIconAsset, SheetConfig } from "./types";

export interface SheetTemplate {
  id: string;
  name: string;
  /** The look, with sample banner words (never empty) and no hero (`lookOf`). */
  config: SheetConfig;
  created: string;
  updated: string;
}

export const TEMPLATE_LIMIT = 60;
export const TEMPLATE_NAME_MAX = 60;

const POSITION_LABEL: Readonly<Record<SheetConfig["banner"]["position"], string>> = {
  left: "Side banner", right: "Right banner", top: "Top banner", bottom: "Bottom banner", none: "Plain grid",
};

/**
 * What a template keeps: the look, the banner words as SAMPLE text (an empty one
 * falls back to the default sample, so a template always shows text), no hero.
 */
export function lookOf(config: SheetConfig): SheetConfig {
  const look = copyConfig(parseSheetConfig(config));
  const title = look.banner.title.trim() === "" ? DEFAULT_CONFIG.banner.title : look.banner.title;
  const subtitle = look.banner.subtitle.trim() === "" ? DEFAULT_CONFIG.banner.subtitle : look.banner.subtitle;
  return { ...look, banner: { ...look.banner, title, subtitle, heroIconId: null } };
}

/** The template as its own sheet: its look with its sample words — what editing it and its block show. */
export function templateConfig(template: SheetTemplate): SheetConfig {
  return parseSheetConfig(template.config);
}

/** The template's look on the current sheet: its words and hero are kept. */
export function applyTemplate(current: SheetConfig, template: SheetTemplate): SheetConfig {
  return applyCopy(template.config, current);
}

/** "Side banner · 8×4 · Split" — a generated name, numbered when it is taken. */
export function templateName(config: SheetConfig, taken: readonly string[]): string {
  const banner = config.banner.position === "none" ? "" : ` · ${config.banner.style === "split" ? "Split" : "Solid"}`;
  const base = `${POSITION_LABEL[config.banner.position]} · ${config.grid.columns}×${config.grid.rows}${banner}`;
  const used = new Set(taken.map((name) => name.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let n = 2; ; n += 1) if (!used.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

/** A name as stored: one line, trimmed, at most TEMPLATE_NAME_MAX characters; "" = invalid. */
export function cleanTemplateName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, TEMPLATE_NAME_MAX);
}

/** A new template from the current sheet. */
export function newTemplate(config: SheetConfig, taken: readonly string[], now: string, id: string): SheetTemplate {
  const look = lookOf(config);
  return { id, name: templateName(look, taken), config: look, created: now, updated: now };
}

/** The saved list, rebuilt field by field: junk entries drop, duplicates keep the first. */
export function parseTemplates(raw: unknown): SheetTemplate[] {
  if (!Array.isArray(raw)) return [];
  const out: SheetTemplate[] = [];
  const ids = new Set<string>();
  for (const entry of raw) {
    const template = parseTemplate(entry);
    if (template === null || ids.has(template.id)) continue;
    ids.add(template.id);
    out.push(template);
    if (out.length >= TEMPLATE_LIMIT) break;
  }
  return out;
}

function parseTemplate(raw: unknown): SheetTemplate | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || raw.id === "" || typeof raw.name !== "string") return null;
  const name = cleanTemplateName(raw.name);
  if (name === "" || !isRecord(raw.config)) return null;
  const created = typeof raw.created === "string" ? raw.created : "";
  const updated = typeof raw.updated === "string" ? raw.updated : created;
  return { id: raw.id.slice(0, 80), name, config: lookOf(parseSheetConfig(raw.config)), created, updated };
}

/** The short facts under a block's name: grid, icon box and stroke. */
export function templateFacts(config: SheetConfig): string {
  return `${config.grid.columns}×${config.grid.rows} · ${config.icons.box}px · stroke ${config.icons.strokeWidth}`;
}

export interface SheetPreviewArgs {
  /** The sheet to draw: a template with its sample words, or an artboard with its own. */
  config: SheetConfig;
  assets: readonly BuilderIconAsset[];
  placedIds: readonly string[];
  svgTexts: Readonly<Record<string, string>>;
}

/** A template's block picture: its own look and sample words, with the given icons. */
export function templatePreviewSvg(args: Omit<SheetPreviewArgs, "config"> & { template: SheetTemplate }): string {
  return sheetPreviewSvg({ ...args, config: templateConfig(args.template) });
}

/**
 * A small sheet picture with the icons that are loaded; a cell without an icon
 * shows a dashed outline so the grid reads even before a folder is open.
 */
export function sheetPreviewSvg(args: SheetPreviewArgs): string {
  const config = args.config;
  const layout = computeLayout(config);
  const loaded = args.placedIds.filter((id) => typeof args.svgTexts[id] === "string" && args.svgTexts[id] !== "");
  const doc = composeSheet({ config, layout, assets: args.assets, placedIds: loaded, svgTexts: args.svgTexts });
  const stroke = Math.max(1, config.icons.strokeWidth);
  const empty = layout.cells.slice(loaded.length).map((cell) => `<rect x="${round(cell.x)}" y="${round(cell.y)}" `
    + `width="${round(cell.size)}" height="${round(cell.size)}" rx="${round(cell.size * 0.12)}" fill="none" `
    + `stroke="${config.icons.color}" stroke-opacity="0.35" stroke-width="${round(stroke)}" stroke-dasharray="4 4"/>`).join("");
  return doc.svg.replace(/<\/svg>$/, `${empty}</svg>`);
}
