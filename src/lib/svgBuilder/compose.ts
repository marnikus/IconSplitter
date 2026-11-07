// compose.ts — pure composition of the standalone, editable sheet SVG. No DOM
// scraping: the same approved asset ids and layout that paint the preview are
// the ones the exported document names (RULE 15/22).
import { configFingerprint } from "./config";
import { wrapTitle } from "./layout";
import { cellGroupOf } from "./svgAsset";
import type {
  BuilderIconAsset, CellFrame, SheetConfig, SheetDocument, SheetLayout, SheetMetadata,
} from "./types";

export interface ComposeSheetArgs {
  config: SheetConfig;
  layout: SheetLayout;
  assets: readonly BuilderIconAsset[];
  placedIds: readonly string[];
  svgTexts: Readonly<Record<string, string>>;
  metadata?: SheetMetadata | null;
}

interface TextArgs {
  x: number; y: number; value: string; size: number; colour: string;
  face: "sans" | "serif" | "mono"; weight: string; anchor?: string;
}

interface CellArgs {
  sheet: ComposeSheetArgs; asset: BuilderIconAsset; frame: CellFrame; id: string; brokenIds: string[];
}

export function composeSheet(args: ComposeSheetArgs): SheetDocument {
  const byId = new Map(args.assets.map((asset) => [asset.id, asset]));
  const placed = [...new Set(args.placedIds)];
  const brokenIds: string[] = [];
  const cells = placed.flatMap((id, index) => {
    const frame = args.layout.cells[index];
    const asset = byId.get(id);
    if (frame === undefined || asset === undefined) { brokenIds.push(id); return []; }
    return [cellMarkup({ sheet: args, asset, frame, id, brokenIds })];
  });
  const fingerprint = configFingerprint(args.config);
  const metadata = args.metadata ?? null;
  const sources = placed.map((id) => byId.get(id)).filter(isAsset).map((a) => ({ id: a.id, fingerprint: a.fingerprint }));
  const svg = [
    rootOpen(args.config, fingerprint), backgroundOf(args.config), bannerOf(args.config, args.layout, metadata),
    ...cells, ...captionsOf(args, placed, byId), metadataOf(metadata, placed, sources, fingerprint), "</svg>",
  ].join("");
  return { svg, placedIds: placed, brokenIds: [...new Set(brokenIds)], sourceFingerprints: sources,
    configFingerprint: fingerprint, metadata };
}

function cellMarkup({ sheet, asset, frame, id, brokenIds }: CellArgs): string {
  const code = sheet.svgTexts[id];
  const cell = typeof code === "string" ? cellGroupOf({ code, asset, frame, style: sheet.config.icons }) : null;
  if (cell === null || !cell.ok) {
    brokenIds.push(id);
    return brokenMarkup(frame, id, cell?.ok === false ? cell.error : "approved SVG is unavailable");
  }
  return cell.html;
}

function rootOpen(config: SheetConfig, fingerprint: string): string {
  const { width, height } = config.artboard;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" `
    + `data-config-fingerprint="${attr(fingerprint)}" data-approved-only="true" role="img">`;
}

function backgroundOf(config: SheetConfig): string {
  const { width, height, background, radius } = config.artboard;
  return `<rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="${attr(background)}" data-artboard="true"/>`;
}

function bannerOf(config: SheetConfig, layout: SheetLayout, metadata: SheetMetadata | null): string {
  const box = layout.banner;
  const banner = config.banner;
  if (box === null || banner.size <= 0) return "";
  const copy = bannerCopy(metadata, banner);
  const lines = wrapTitle(copy.title, titleWrapChars(banner.position));
  const ty = box.y + Math.max(52, box.height * 0.38);
  const texts = lines.map((line, i) => text({ x: box.x + 32, y: ty + i * (banner.titleSize + 4), value: line,
    size: banner.titleSize, colour: banner.textColor, face: banner.titleFace, weight: "600" })).join("");
  const sub = text({ x: box.x + 32, y: ty + lines.length * (banner.titleSize + 4) + 18, value: copy.subtitle,
    size: banner.subtitleSize, colour: banner.subtitleColor, face: "sans", weight: "400" });
  return `<g data-banner="true"><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="${attr(banner.background)}"/>`
    + `${heroMark(box, banner)}${texts}${sub}${dividerMark(box, banner)}</g>`;
}

function bannerCopy(metadata: SheetMetadata | null, banner: SheetConfig["banner"]): { title: string; subtitle: string } {
  const accepted = metadata?.state === "accepted";
  return {
    title: accepted && metadata.title !== "" ? metadata.title : banner.title,
    subtitle: accepted && metadata.subtitle !== "" ? metadata.subtitle : banner.subtitle,
  };
}

function titleWrapChars(position: SheetConfig["banner"]["position"]): number {
  return position === "top" || position === "bottom" ? 50 : 14;
}

function heroMark(box: { x: number; y: number }, banner: SheetConfig["banner"]): string {
  return banner.hero ? `<circle cx="${box.x + 44}" cy="${box.y + 44}" r="15" fill="${attr(banner.accent)}" data-banner-hero="true"/>` : "";
}

function dividerMark(box: { x: number; y: number; width: number; height: number }, banner: SheetConfig["banner"]): string {
  return banner.divider ? `<rect x="${box.x + 32}" y="${box.y + box.height - 44}" width="${Math.max(0, box.width - 64)}" height="1" fill="${attr(banner.accent)}" opacity="0.55"/>` : "";
}

function captionsOf(args: ComposeSheetArgs, placed: readonly string[], byId: ReadonlyMap<string, BuilderIconAsset>): string[] {
  if (!args.config.grid.captions) return [];
  return placed.flatMap((id, index) => {
    const frame = args.layout.cells[index];
    const asset = byId.get(id);
    if (frame === undefined || asset === undefined) return [];
    const label = args.config.grid.captionCase === "upper" ? asset.label.toUpperCase() : asset.label;
    return [text({ x: frame.x + frame.size / 2, y: frame.captionY, value: label,
      size: args.config.grid.captionSize, colour: args.config.grid.captionColor, face: "sans", weight: "500", anchor: "middle" })];
  });
}

function metadataOf(
  metadata: SheetMetadata | null, placed: readonly string[],
  sources: readonly { id: string; fingerprint: string }[], fingerprint: string,
): string {
  const accepted = metadata?.state === "accepted" ? metadata : null;
  const title = accepted?.title ?? "";
  const desc = accepted === null ? "" : `${accepted.subtitle} Keywords: ${accepted.keywords.join(", ")}`;
  const payload = JSON.stringify({ v: 1, approvedOnly: true, title, placedIds: placed, sources, configFingerprint: fingerprint });
  return `<title>${escapeText(title)}</title><desc>${escapeText(desc)}</desc><metadata>${escapeText(payload)}</metadata>`;
}

function brokenMarkup(frame: CellFrame, id: string, reason: string): string {
  return `<g data-broken-asset="${attr(id)}" data-reason="${attr(reason)}">`
    + `<rect x="${frame.x}" y="${frame.y}" width="${frame.size}" height="${frame.size}" rx="6" fill="none" stroke="#C85A5A" stroke-dasharray="4 4"/>`
    + `${text({ x: frame.x + frame.size / 2, y: frame.y + frame.size / 2, value: "Unavailable", size: 10,
      colour: "#C85A5A", face: "sans", weight: "500", anchor: "middle" })}</g>`;
}

function text(a: TextArgs): string {
  const anchor = a.anchor ?? "start";
  return `<text x="${round(a.x)}" y="${round(a.y)}" fill="${attr(a.colour)}" font-size="${a.size}" font-weight="${a.weight}" `
    + `font-family="${fontFamily(a.face)}" text-anchor="${anchor}" letter-spacing="0.04em">${escapeText(a.value)}</text>`;
}

function fontFamily(face: "sans" | "serif" | "mono"): string {
  return face === "serif" ? "ui-serif, Georgia, serif" : face === "mono" ? "ui-monospace, monospace" : "ui-sans-serif, system-ui, sans-serif";
}

function isAsset(asset: BuilderIconAsset | undefined): asset is BuilderIconAsset {
  return asset !== undefined;
}

function round(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function attr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
