// svgAsset.ts — turns one approved SVG file into a safe, fitted cell group.
// Reuses the app's validated preview sanitizer, then recolours the artwork for
// the sheet. Preview, artboard and export all use this same source.
import { buildSvgPreview } from "../svgpreview";
import { validateSvg } from "../svgvalidate";
import { fnv1a32 } from "../pairing";
import type { BuilderIconAsset, CellFrame, SheetConfig } from "./types";

const DRAWABLE = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "use"]);
const OPACITY = ["opacity", "fill-opacity", "stroke-opacity"];
const UNSAFE = new Set(["script", "foreignobject", "handler", "listener", "iframe", "object", "embed"]);

export interface CellSvgArgs {
  code: string;
  asset: BuilderIconAsset;
  frame: CellFrame;
  style: SheetConfig["icons"];
}

export type CellSvgResult = { ok: true; html: string } | { ok: false; error: string };

type Sanitized = { ok: true; children: string; box: [number, number, number, number] } | { ok: false; error: string };

/**
 * Sanitised icons, by icon + cell + exact SVG text (2026-11-15, performance):
 * validating, parsing, id-scoping and recolouring an icon is the costly part of
 * composing a sheet, and the same icon is composed again and again (stage,
 * template and artboard pictures, every edit). Only the cheap wrapper (cell
 * transform, colour, stroke) is rebuilt each time. Bounded, oldest first out.
 */
const SANITIZED = new Map<string, Sanitized>();
const SANITIZED_MAX = 4000;

/** Tests / measurements: forget every sanitised icon. */
export function clearSanitizedIcons(): void {
  SANITIZED.clear();
}

function sanitizedOf(code: string, assetId: string, index: number): Sanitized {
  const key = `${assetId}\u0000${index}\u0000${code.length}\u0000${fnv1a32(code)}`;
  const hit = SANITIZED.get(key);
  if (hit !== undefined) return hit;
  const made = sanitize(code, assetId, index);
  if (SANITIZED.size >= SANITIZED_MAX) SANITIZED.delete(SANITIZED.keys().next().value as string);
  SANITIZED.set(key, made);
  return made;
}

function sanitize(code: string, assetId: string, index: number): Sanitized {
  const check = validateSvg(code);
  if (!check.ok) return { ok: false, error: check.errors[0] ?? "invalid approved SVG" };
  const preview = buildSvgPreview(code);
  if (!preview.ok) return { ok: false, error: preview.error ?? "cannot fit approved SVG" };
  const doc = new DOMParser().parseFromString(preview.html, "image/svg+xml");
  if (doc.getElementsByTagName("parsererror").length > 0 || name(doc.documentElement) !== "svg") {
    return { ok: false, error: "sanitized SVG could not be embedded" };
  }
  const root = doc.documentElement;
  const box = viewBoxOf(preview.viewBox);
  if (box === null) return { ok: false, error: "approved SVG has no usable viewBox" };
  scopeLocalIds(root, `b${fnv1a32(`${assetId}:${index}`).toString(16)}`);
  recolor(root);
  return { ok: true, children: childrenOf(root), box };
}

export function cellGroupOf(args: CellSvgArgs): CellSvgResult {
  const s = sanitizedOf(args.code, args.asset.id, args.frame.index);
  if (!s.ok) return s;
  const placed = placementOf(args.frame, s.box);
  return { ok: true, html: groupOf(args, s.children, s.box, placed) };
}

function groupOf(args: CellSvgArgs, children: string, box: readonly number[], placed: Placement): string {
  const style = args.style;
  const attrs = [
    `data-asset-id="${attr(args.asset.id)}"`, 'data-approved="true"',
    `data-cell-index="${args.frame.index}"`, `transform="${placed.transform}"`,
    'fill="none"', 'stroke="currentColor"', `color="${attr(style.color)}"`,
    `stroke-width="${penWidth(style.strokeWidth, placed.scale)}"`, `stroke-linecap="${style.linecap}"`,
    `stroke-linejoin="${style.linecap === "square" ? "miter" : "round"}"`, `data-view-box="${attr(box.join(" "))}"`,
  ];
  return `<g ${attrs.join(" ")}>${children}</g>`;
}

function childrenOf(root: Element): string {
  const serializer = new XMLSerializer();
  return Array.from(root.childNodes)
    .filter((node) => node.nodeType === 1 && !UNSAFE.has(name(node as Element)))
    .map((node) => serializer.serializeToString(node)).join("");
}

function recolor(root: Element): void {
  for (const el of [root, ...Array.from(root.getElementsByTagName("*"))]) {
    if (UNSAFE.has(name(el))) continue;
    el.removeAttribute("style");
    for (const a of OPACITY) el.removeAttribute(a); // the artwork is never transparent (2026-11-14)
    if (!DRAWABLE.has(name(el))) continue;
    el.setAttribute("fill", "none");
    el.setAttribute("stroke", "currentColor");
  }
}

function scopeLocalIds(root: Element, prefix: string): void {
  const elements = [root, ...Array.from(root.getElementsByTagName("*"))];
  const ids = new Map<string, string>();
  for (const el of elements) {
    const id = el.getAttribute("id");
    if (id !== null && id !== "") {
      const next = `${prefix}-${id}`;
      ids.set(id, next);
      el.setAttribute("id", next);
    }
  }
  for (const el of elements) rewriteRefs(el, ids);
}

function rewriteRefs(el: Element, ids: ReadonlyMap<string, string>): void {
  for (const attribute of Array.from(el.attributes)) {
    const value = attribute.value;
    const changed = value.replace(/#([\w:.-]+)/g, (hit, id: string) => ids.has(id) ? `#${ids.get(id)}` : hit);
    if (changed !== value) el.setAttribute(attribute.name, changed);
  }
}

/** Where one icon sits: the artwork fits `frame.glyph`, centred inside the `frame.size` box. */
interface Placement {
  transform: string;
  /** The scale the transform really applies (rounded, so the pen width below is exact). */
  scale: number;
}

function placementOf(frame: CellFrame, box: readonly number[]): Placement {
  const [, , width, height] = box;
  const glyph = frame.glyph > 0 ? Math.min(frame.glyph, frame.size) : frame.size;
  const scale = Number(round(Math.min(glyph / width, glyph / height)));
  const dx = frame.x + (frame.size - width * scale) / 2 - box[0] * scale;
  const dy = frame.y + (frame.size - height * scale) / 2 - box[1] * scale;
  return { scale, transform: `translate(${round(dx)} ${round(dy)}) scale(${round(scale)})` };
}

/**
 * The stroke width is authored in ARTBOARD pixels (the panel's 1 px), but the
 * cell's transform scales it — so the drawn width is written back down by that
 * scale (2026-11-19). A `vector-effect="non-scaling-stroke"` shortcut used to
 * stand in for this, which only the browser honoured: the saved EPS (and every
 * other consumer) painted 1 px × the cell scale. Now every format agrees.
 */
function penWidth(width: number, scale: number): string {
  return round(scale > 0 ? width / scale : width);
}

/** A stroke-only 24×24 preview: the library tile shows exactly what the artboard will draw. */
export function iconPreviewSvg(code: string, asset: BuilderIconAsset, style: SheetConfig["icons"]): string | null {
  const frame: CellFrame = { index: 0, x: 0, y: 0, size: 24, glyph: 20, captionY: 0, captionSize: 0 };
  const cell = cellGroupOf({ code, asset, frame, style });
  if (!cell.ok) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%">${cell.html}</svg>`;
}

function viewBoxOf(text: string): [number, number, number, number] | null {
  const parts = text.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return parts[2] > 0 && parts[3] > 0 ? parts as [number, number, number, number] : null;
}

function name(el: Element): string {
  return el.localName.toLowerCase();
}

function round(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function attr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
