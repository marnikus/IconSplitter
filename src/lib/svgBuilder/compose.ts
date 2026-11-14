// compose.ts — pure composition of the standalone, editable sheet SVG. The same
// approved asset ids and layout that paint the preview are the ones the export
// names (RULE 15/22). Empty-cell placeholders and lock buttons are preview-only
// overlays and are never part of this document.
import { configFingerprint } from "./config";
import { bannerMarkup, type HeroPainter } from "./banner";
import { attr, escapeText, round, textEl } from "./markup";
import { cellGroupOf } from "./svgAsset";
import { isEmptySlot } from "./slots";
import { captionOf } from "./assets";
import type { BuilderIconAsset, CellFrame, SheetConfig, SheetDocument, SheetLayout, SheetMetadata } from "./types";

export interface ComposeSheetArgs {
  config: SheetConfig;
  layout: SheetLayout;
  assets: readonly BuilderIconAsset[];
  placedIds: readonly string[];
  svgTexts: Readonly<Record<string, string>>;
  metadata?: SheetMetadata | null;
}

interface Placed { id: string; asset: BuilderIconAsset | undefined; frame: CellFrame }

export function composeSheet(args: ComposeSheetArgs): SheetDocument {
  const byId = new Map(args.assets.map((asset) => [asset.id, asset]));
  const placed: Placed[] = [...new Set(args.placedIds)].slice(0, args.layout.cells.length)
    .map((id, index) => ({ id, asset: byId.get(id), frame: args.layout.cells[index] }))
    .filter((p) => !isEmptySlot(p.id));
  const brokenIds: string[] = [];
  const cells = placed.map((p) => cellMarkup(args, p, brokenIds));
  const fingerprint = configFingerprint(args.config);
  const metadata = args.metadata ?? null;
  const ids = placed.map((p) => p.id);
  const sources = placed.flatMap((p) => (p.asset === undefined ? [] : [{ id: p.id, fingerprint: p.asset.fingerprint }]));
  const copy = sheetCopy(metadata, args.config.banner);
  const svg = [
    rootOpen(args.config, fingerprint), headOf(copy.title, metadata, { ids, sources, fingerprint }),
    backgroundOf(args.config), bannerOf(args, copy, ids), `<g data-export="icons">${cells.join("")}</g>`,
    captionsOf(args, placed), "</svg>",
  ].join("");
  return { svg, placedIds: ids, brokenIds: [...new Set(brokenIds)], sourceFingerprints: sources, configFingerprint: fingerprint, metadata };
}

/** Accepted provider metadata overrides the typed banner copy. */
export function sheetCopy(metadata: SheetMetadata | null, banner: SheetConfig["banner"]): { title: string; subtitle: string } {
  const accepted = metadata?.state === "accepted";
  return {
    title: accepted && metadata.title !== "" ? metadata.title : banner.title,
    subtitle: accepted && metadata.subtitle !== "" ? metadata.subtitle : banner.subtitle,
  };
}

function cellMarkup(args: ComposeSheetArgs, p: Placed, brokenIds: string[]): string {
  const code = args.svgTexts[p.id];
  const cell = p.asset !== undefined && typeof code === "string" && code !== ""
    ? cellGroupOf({ code, asset: p.asset, frame: p.frame, style: args.config.icons }) : null;
  if (cell !== null && cell.ok) return cell.html;
  brokenIds.push(p.id);
  return brokenMarkup(p.frame, p.id, cell?.ok === false ? cell.error : "approved SVG is unavailable");
}

function rootOpen(config: SheetConfig, fingerprint: string): string {
  const { width, height } = config.artboard;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" `
    + `data-config-fingerprint="${attr(fingerprint)}" data-approved-only="true" role="img">`;
}

function headOf(title: string, metadata: SheetMetadata | null, trace: { ids: string[]; sources: { id: string; fingerprint: string }[]; fingerprint: string }): string {
  const accepted = metadata?.state === "accepted" ? metadata : null;
  const desc = accepted === null ? "Generated with the SVG builder. Editable stroke-only icon sheet."
    : `${accepted.subtitle} Keywords: ${accepted.keywords.join(", ")}`;
  const payload = JSON.stringify({ v: 1, approvedOnly: true, title, placedIds: trace.ids, sources: trace.sources, configFingerprint: trace.fingerprint });
  return `<title>${escapeText(`${title.trim() || "Icon sheet"} — icon sheet`)}</title><desc>${escapeText(desc)}</desc><metadata>${escapeText(payload)}</metadata>`;
}

function backgroundOf(config: SheetConfig): string {
  const { width, height, background, radius } = config.artboard;
  return `<rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="${attr(background)}" data-artboard="true"/>`;
}

function bannerOf(args: ComposeSheetArgs, copy: { title: string; subtitle: string }, ids: readonly string[]): string {
  const box = args.layout.banner;
  if (box === null) return "";
  return bannerMarkup({ banner: args.config.banner, box, artboardWidth: args.config.artboard.width,
    title: copy.title, subtitle: copy.subtitle, hero: heroPainter(args, ids) });
}

/** The hero glyph: the chosen library icon, else the first placed icon; the banner's Icon stroke in the given ink. */
function heroPainter(args: ComposeSheetArgs, ids: readonly string[]): HeroPainter {
  const id = args.config.banner.heroIconId ?? ids[0];
  const asset = args.assets.find((a) => a.id === id);
  const code = id === undefined ? undefined : args.svgTexts[id];
  return (x, y, size, ink) => {
    if (asset === undefined || typeof code !== "string" || code === "") return "";
    const frame: CellFrame = { index: -1, x, y, size, glyph: size, captionY: 0, captionSize: 0 };
    const cell = cellGroupOf({ code, asset, frame, style: { ...args.config.icons, color: ink, strokeWidth: args.config.banner.heroStroke } });
    return cell.ok ? cell.html : "";
  };
}

/** Captions: centred, auto-shrunk to the box width, letter-spaced .075em. */
function captionsOf(args: ComposeSheetArgs, placed: readonly Placed[]): string {
  const grid = args.config.grid;
  if (!grid.captions) return "";
  const texts = placed.flatMap(({ asset, frame }) => {
    if (asset === undefined) return [];
    const caption = captionOf(asset);
    const label = grid.captionCase === "upper" ? caption.toUpperCase() : caption;
    const base = frame.captionSize;
    const size = Math.max(3.2, base * Math.min(1, (frame.size * 0.96) / Math.max(1, label.length * base * 0.67)));
    return [textEl({ x: frame.x + frame.size / 2, y: frame.captionY, value: label, size, colour: grid.captionColor,
      face: "sans", weight: 500, anchor: "middle", spacing: "0.075em" })];
  });
  return `<g data-export="captions">${texts.join("")}</g>`;
}

function brokenMarkup(frame: CellFrame, id: string, reason: string): string {
  return `<g data-broken-asset="${attr(id)}" data-reason="${attr(reason)}">`
    + `<rect x="${round(frame.x)}" y="${round(frame.y)}" width="${round(frame.size)}" height="${round(frame.size)}" rx="6" fill="none" stroke="#C85A5A" stroke-dasharray="4 4"/>`
    + `${textEl({ x: frame.x + frame.size / 2, y: frame.y + frame.size / 2, value: "Unavailable", size: 10,
      colour: "#C85A5A", face: "sans", weight: 500, anchor: "middle" })}</g>`;
}
