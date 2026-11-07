// serialize.ts — the sheet as one editable SVG document (design §5.4).
//
// This is the whole point of the builder: an SVG a designer can open in Illustrator
// or Inkscape, where every icon is still a nested `<svg>` with its own paths and
// every caption is still `<text>` with a real font. Nothing is outlined, nothing is
// rasterised, nothing is measured at runtime — the numbers come from the same
// `computeLayout` the screen draws with, so what was seen is what is written.
//
// The six guarantees (each pinned by tests/builder_serialize.test.ts):
//   1. width/height/viewBox are the artboard's own pixels.
//   2. Every icon is a nested <svg> inside a <g data-cell="n">, paths verbatim.
//   3. The stroke is declared ONCE, on the group that owns it.
//   4. Text is real <text>, escaped, never a path.
//   5. Byte-identical for identical input (no clock, no random ids).
//   6. Well-formed and safe: parses, passes lib/svgvalidate, no script/remote refs.

import type { BuilderConfig } from "./defaults";
import type { CellFrame, SheetLayout } from "./layout";
import { wrapTitle } from "./layout";
import type { PlacedIcon, PlaceRefusal } from "./place";

export interface Placement {
  /** The library icon's stable id — carried into `data-icon-id` for traceability. */
  iconId: string;
  /** The cell the layout gave this icon. */
  cell: CellFrame;
  /** The sanitised artwork, or the refusal that kept it out of the export. */
  art: PlacedIcon | PlaceRefusal;
  /** The caption to draw, or null for none. */
  caption: string | null;
}

export interface SerializeInput {
  config: BuilderConfig;
  layout: SheetLayout;
  placements: readonly Placement[];
  /** The banner's own words (empty strings draw no text at all). */
  title: string;
  subtitle: string;
}

/** One editable SVG: the sheet, exactly as laid out. */
export function serializeSheet(input: SerializeInput): string {
  const { config } = input;
  const a = config.artboard;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${a.width}" height="${a.height}" viewBox="0 0 ${a.width} ${a.height}">`,
    `<rect x="0" y="0" width="${a.width}" height="${a.height}"${a.radius > 0 ? ` rx="${a.radius}"` : ""} fill="${esc(a.background)}"/>`,
    bannerMarkup(input),
    contentMarkup(input),
    "</svg>",
  ];
  return parts.filter((p) => p !== "").join("");
}

/** The banner band and its two lines of text (or nothing when there is no banner). */
function bannerMarkup(input: SerializeInput): string {
  const rect = input.layout.banner;
  if (rect === null) return "";
  const b = input.config.banner;
  const lines = [
    `<rect x="${n(rect.left)}" y="${n(rect.top)}" width="${n(rect.width)}" height="${n(rect.height)}" fill="${esc(b.background)}"/>`,
    ...titleLines(input, rect),
  ];
  return `<g data-banner="1">${lines.join("")}</g>`;
}

/** The title (wrapped, up to three lines) and the subtitle, as real text. */
function titleLines(input: SerializeInput, rect: { left: number; top: number; width: number }): string[] {
  const b = input.config.banner;
  const out: string[] = [];
  const maxChars = Math.max(8, Math.floor(rect.width / (b.titleSize * 0.55)));
  const title = input.title === "" ? "" : input.title;
  if (title !== "") {
    wrapTitle(title, maxChars).forEach((line, index) => {
      out.push(text(line, rect.left + 18, rect.top + b.titleSize + 16 + index * b.titleSize * 1.2, {
        fill: b.textColor, size: b.titleSize, face: b.titleFace, anchor: "start",
      }));
    });
  }
  if (input.subtitle !== "") {
    const y = rect.top + b.titleSize + b.subtitleSize + 24;
    out.push(text(input.subtitle, rect.left + 18, y, { fill: b.subtitleColor, size: b.subtitleSize, face: b.titleFace, anchor: "start" }));
  }
  return out;
}

/** The cells: one group each, the stroke declared once on the owning group. */
function contentMarkup(input: SerializeInput): string {
  const placed = input.placements.filter((p): p is Placement & { art: PlacedIcon } => p.art.ok);
  if (placed.length === 0) return "";
  return `<g data-layer="icons"${strokeAttrs(input.config)}>${placed.map((p) => cellMarkup(input, p)).join("")}</g>`;
}

/** The one stroke declaration: on the layer group, or nothing when unset. */
function strokeAttrs(config: BuilderConfig): string {
  const icons = config.icons;
  if (icons.strokeWidth <= 0) return "";
  return ` stroke="${esc(icons.color)}" stroke-width="${icons.strokeWidth}" fill="none"`;
}

/** One cell: the artwork as a nested svg, then its caption. */
function cellMarkup(input: SerializeInput, p: Placement & { art: PlacedIcon }): string {
  const art = p.art;
  const cell = p.cell;
  const box = art.box === "" ? "0 0 24 24" : art.box;
  const svg = `<svg x="${n(cell.left)}" y="${n(cell.top)}" width="${n(cell.iconSize)}" height="${n(cell.iconSize)}" viewBox="${esc(box)}">${innerOf(art.markup)}</svg>`;
  const caption = captionText(input, p);
  return `<g data-cell="${cell.index}" data-icon-id="${esc(p.iconId)}">${svg}${caption}</g>`;
}

/** The caption under an icon, honouring `captions` and `captionCase`. */
function captionText(input: SerializeInput, p: Placement): string {
  if (!input.config.grid.captions || p.caption === null || p.caption === "") return "";
  const c = input.config.grid;
  const label = c.captionCase === "upper" ? p.caption.toUpperCase() : p.caption;
  const y = p.cell.top + p.cell.iconSize + p.cell.captionHeight - 2;
  return text(label, p.cell.left + p.cell.width / 2, y, {
    fill: c.captionColor, size: Math.max(1, c.captionSize * fitOf(p.cell, input.config)), face: "sans", anchor: "middle",
  });
}

/** One `<text>` element with the attributes a designer expects to find. */
function text(
  content: string, x: number, y: number,
  style: { fill: string; size: number; face: BuilderConfig["banner"]["titleFace"]; anchor: "start" | "middle" },
): string {
  return `<text x="${n(x)}" y="${n(y)}" fill="${esc(style.fill)}" font-family="${esc(faceOf(style.face))}" `
    + `font-size="${n(style.size)}" text-anchor="${style.anchor}">${esc(content)}</text>`;
}

/** The system stacks (RULE 20: no CDN, so no web fonts in the export either). */
function faceOf(face: BuilderConfig["banner"]["titleFace"]): string {
  if (face === "serif") return "Georgia, 'Times New Roman', serif";
  if (face === "mono") return "ui-monospace, SFMono-Regular, Menlo, monospace";
  return "system-ui, -apple-system, 'Segoe UI', sans-serif";
}

/** A cell's fit scale, relative to the configured icon box. */
function fitOf(cell: CellFrame, config: BuilderConfig): number {
  return config.icons.box <= 0 ? 1 : cell.iconSize / config.icons.box;
}

/** The children of a one-root `<svg>` string. */
function innerOf(markup: string): string {
  const open = markup.indexOf(">");
  const close = markup.lastIndexOf("</svg>");
  return open < 0 || close < 0 ? "" : markup.slice(open + 1, close);
}

/** Numbers are written without exponent notation and without a trailing `.0`. */
function n(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isFinite(rounded) ? String(rounded) : "0";
}

/** XML text/attribute escaping — a caption may contain anything a user typed. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The file name a sheet is saved under: stable, no clock, no collisions. */
export function sheetFileName(config: BuilderConfig, index = 1): string {
  const a = config.artboard;
  const suffix = index > 1 ? `-${index}` : "";
  return `icon-sheet-${a.width}x${a.height}-${config.grid.columns}x${config.grid.rows}${suffix}.svg`;
}

/**
 * Whether an exported sheet is well-formed AND structurally valid as a SHEET.
 *
 * `lib/svgvalidate` is the gate for a provider's answer and (deliberately) allows
 * exactly one `<svg>`: a reply that carries two documents is ambiguous. A sheet is
 * the opposite shape — nesting one `<svg>` per icon is what keeps every glyph
 * editable — so it gets its own rule here instead of loosening that gate.
 */
export function validateSheet(svg: string): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (doc.getElementsByTagName("parsererror").length > 0) errors.push("not well-formed XML");
  const root = doc.documentElement;
  if (root.nodeName.toLowerCase() !== "svg") errors.push("root element is not <svg>");
  if (!positive(root.getAttribute("width")) || !positive(root.getAttribute("height"))) errors.push("no usable width/height");
  if (doc.getElementsByTagName("script").length > 0) errors.push("unsafe <script> element");
  if (doc.getElementsByTagName("foreignObject").length > 0) errors.push("unsafe <foreignObject> element");
  return { ok: errors.length === 0, errors };
}

function positive(value: string | null): boolean {
  const n = Number(value);
  return value !== null && value.trim() !== "" && Number.isFinite(n) && n > 0;
}
