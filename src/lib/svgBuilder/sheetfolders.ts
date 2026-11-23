// sheetfolders.ts — where templates and their artboards are saved in the scanned
// root (2026-11-16), the same tree as single icons but under `_artboard_sheets`:
//   _artboard_sheets/<YYYY-MM>/<YYYY-MM-DD>/<template>/          template.json
//   _artboard_sheets/…/<template>/artboard_<NN>_<its title>/   metadata.json, preview.png, export/
// <template> = `<its title>_sheet_<cells>_icons_<colour>_<colour>_palette_id<code>`,
// made when the template is created; every derived artboard lives inside it. Pure.
import { fnv1a32 } from "../pairing";
import type { FinalArtboard } from "./artboards";
import type { SheetConfig } from "./types";
import type { SheetTemplate } from "./templates";

export const SHEETS_DIR = "_artboard_sheets";

const pad = (n: number) => String(n).padStart(2, "0");

/** `<YYYY-MM>/<YYYY-MM-DD>` in local time — the folders a human opens. */
export function dayPath(now: Date): string {
  const month = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  return `${month}/${month}-${pad(now.getDate())}`;
}

function hsl(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (m === null) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

const HUES: readonly [number, string][] = [[15, "red"], [40, "orange"], [65, "yellow"], [160, "green"], [195, "teal"], [255, "blue"], [290, "purple"], [335, "pink"], [360, "red"]];

/** One plain colour word for a hex (black, white, gray, brown, or its hue). */
export function colorWord(hex: string): string {
  const c = hsl(hex);
  if (c === null) return "mixed";
  if (c.l < 0.12) return "black";
  if (c.l > 0.92) return "white";
  if (c.s < 0.15) return "gray";
  if (c.h >= 15 && c.h < 45 && c.l < 0.4) return "brown";
  return HUES.find(([top]) => c.h < top)?.[1] ?? "red";
}

/** The sheet's two leading colours: banner background + accent, or (no banner) canvas + icons. */
export function paletteWords(config: SheetConfig): string[] {
  const pair = config.banner.position === "none" ? [config.artboard.background, config.icons.color] : [config.banner.background, config.banner.accent];
  return [...new Set(pair.map(colorWord))];
}

/** Lowercase words joined by hyphens: letters and digits only. */
export function slugWords(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "artboard";
}

/** A short stable number for a template: `23531`. */
export function templateCode(templateId: string): string {
  return String(fnv1a32(templateId) % 100000).padStart(5, "0");
}

export function sheetFolderName(args: { title: string; icons: number; palette: readonly string[]; templateId: string }): string {
  return `${slugWords(args.title)}_sheet_${args.icons}_icons_${args.palette.join("_")}_palette_id${templateCode(args.templateId)}`;
}

/**
 * A template's homes on disk, best first: where an artboard of it already lives
 * (its artboards never split from it, 2026-11-16), then its own folder. Removing
 * it moves both (2026-11-22), so no stray template.json is left to register.
 */
export function templateHomes(template: Pick<SheetTemplate, "id" | "folder">, artboards: readonly FinalArtboard[]): string[] {
  const lived = artboards.find((a) => a.templateId === template.id && a.folder !== null)?.folder ?? null;
  const homes = [lived === null ? "" : lived.slice(0, lived.lastIndexOf("/")), template.folder ?? ""];
  return [...new Set(homes.filter((h) => h !== ""))];
}

/**
 * A template's folder (2026-11-16): the one it already has, else a new one under
 * the given day, named from ITS title, cell count, banner colours and code.
 */
export function templateFolder(template: Pick<SheetTemplate, "id" | "config" | "folder">, now: Date, artboards: readonly FinalArtboard[] = []): string {
  const home = templateHomes(template, artboards)[0];
  if (home !== undefined) return home;
  const { config } = template;
  const name = sheetFolderName({ title: config.banner.title, icons: config.grid.columns * config.grid.rows, palette: paletteWords(config), templateId: template.id });
  return `${SHEETS_DIR}/${dayPath(now)}/${name}`;
}

/** The artboard's variant number: its "#N", else its place among its template's artboards. */
export function variantOf(artboard: FinalArtboard, artboards: readonly FinalArtboard[]): number {
  const hash = /#(\d+)\s*$/.exec(artboard.name);
  if (hash !== null) return Number(hash[1]);
  const mine = artboards.filter((a) => a.templateId === artboard.templateId);
  return Math.max(1, mine.findIndex((a) => a.id === artboard.id) + 1);
}

export interface FolderArgs { artboard: FinalArtboard; artboards: readonly FinalArtboard[]; template: Pick<SheetTemplate, "id" | "config" | "folder">; now: Date }

/**
 * An artboard's folder, INSIDE its template's folder (2026-11-16):
 * `artboard_<NN>_<its title>`; the one it already has is kept.
 */
export function artboardFolder(args: FolderArgs): string {
  if (args.artboard.folder !== null) return args.artboard.folder;
  const n = String(variantOf(args.artboard, args.artboards)).padStart(2, "0");
  return `${templateFolder(args.template, args.now, args.artboards)}/artboard_${n}_${slugWords(args.artboard.title || args.artboard.name)}`;
}

/** The stem the export files carry: the sheet folder name + `_v<N>`. */
export function sheetStem(folder: string): string {
  const parts = folder.split("/");
  const last = parts[parts.length - 1] ?? "";
  const variant = Number(/^artboard_(?:variant_)?(\d+)/.exec(last)?.[1] ?? /(\d+)$/.exec(last)?.[1] ?? "1");
  return `${parts[parts.length - 2] ?? "sheet"}_v${variant}`;
}
