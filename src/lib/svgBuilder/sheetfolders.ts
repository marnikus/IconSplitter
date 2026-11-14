// sheetfolders.ts — where an artboard sheet is saved in the scanned root
// (2026-11-14), the same tree as single icons but under `_artboard_sheets`:
//   _artboard_sheets/<YYYY-MM>/<YYYY-MM-DD>/<sheet>/artboard_variant_<N>/export
// <sheet> = `<title-artboard>_sheet_<count>_icons_<colour>_<colour>_palette_id<code>`;
// every artboard of one template shares its template's sheet folder (the first
// one saved names it) and is its own variant (its "#N"). Pure.
import { fnv1a32 } from "../pairing";
import type { FinalArtboard } from "./artboards";
import type { SheetConfig } from "./types";

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

/** The artboard's variant number: its "#N", else its place among its template's artboards. */
export function variantOf(artboard: FinalArtboard, artboards: readonly FinalArtboard[]): number {
  const hash = /#(\d+)\s*$/.exec(artboard.name);
  if (hash !== null) return Number(hash[1]);
  const mine = artboards.filter((a) => a.templateId === artboard.templateId);
  return Math.max(1, mine.findIndex((a) => a.id === artboard.id) + 1);
}

export interface FolderArgs { artboard: FinalArtboard; artboards: readonly FinalArtboard[]; config: SheetConfig; icons: number; now: Date }

/**
 * The artboard's `artboard_variant_N` folder, relative to the root: the one it
 * already has; else in the sheet folder another artboard of its template has;
 * else a new sheet folder named from this artboard, under today's date.
 */
export function artboardFolder(args: FolderArgs): string {
  const { artboard } = args;
  if (artboard.folder !== null) return artboard.folder;
  const variant = `artboard_variant_${variantOf(artboard, args.artboards)}`;
  const sibling = args.artboards.find((a) => a.templateId === artboard.templateId && a.id !== artboard.id && a.folder !== null)?.folder;
  if (sibling != null) return `${sibling.slice(0, sibling.lastIndexOf("/"))}/${variant}`;
  const name = sheetFolderName({ title: artboard.title, icons: args.icons, palette: paletteWords(args.config), templateId: artboard.templateId });
  return `${SHEETS_DIR}/${dayPath(args.now)}/${name}/${variant}`;
}

/** The stem the export files carry: the sheet folder name + `_v<N>`. */
export function sheetStem(folder: string): string {
  const parts = folder.split("/");
  const variant = /(\d+)$/.exec(parts[parts.length - 1] ?? "")?.[1] ?? "1";
  return `${parts[parts.length - 2] ?? "sheet"}_v${variant}`;
}
