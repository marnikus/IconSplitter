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
  const fit = fitOf(args.frame, s.box);
  return { ok: true, html: groupOf({ args, children: s.children, box: s.box, transform: transformOf(fit), fit }) };
}

interface CellMarkup { args: CellSvgArgs; children: string; box: readonly number[]; transform: string; fit: Fit }

function groupOf(m: CellMarkup): string {
  const attrs = [`transform="${m.transform}"`, ...identOf(m.args, m.box), ...paintOf(m.args.style, m.fit)];
  return `<g ${attrs.join(" ")}>${m.children}</g>`;
}

/** Which icon this is and where it came from — the sheet's own traceability (never exported words). */
function identOf(args: CellSvgArgs, box: readonly number[]): string[] {
  return [`data-asset-id="${attr(args.asset.id)}"`, 'data-approved="true"',
    `data-cell-index="${args.frame.index}"`, 'fill="none"', `data-view-box="${attr(box.join(" "))}"`];
}

/** The pen the cell paints: one colour, one final width (see `finalWidthOf`). */
function paintOf(style: CellSvgArgs["style"], fit: Fit): string[] {
  return ['stroke="currentColor"', `color="${attr(style.color)}"`, `stroke-width="${finalWidthOf(style.strokeWidth, fit)}"`,
    `stroke-linecap="${style.linecap}"`, `stroke-linejoin="${style.linecap === "square" ? "miter" : "round"}"`];
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
    // NO `vector-effect` (2026-11-19): it did nothing — the cell group carries the
    // `scale()` that fits the artwork — and its presence claimed a pen the file
    // did not paint. The group's own width is written in final px instead.
    el.removeAttribute("vector-effect");
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

/** The scale the artwork is fitted at, and the box it lands in: `glyph` px inside the `size` box. */
interface Fit { scale: number; glyph: number; size: number; dx: number; dy: number }

/** Stroke-aware bounds: the artwork fits `frame.glyph`, centred inside the `frame.size` box. */
function fitOf(frame: CellFrame, box: readonly number[]): Fit {
  const [, , width, height] = box;
  const glyph = frame.glyph > 0 ? Math.min(frame.glyph, frame.size) : frame.size;
  const scale = Math.min(glyph / width, glyph / height);
  return { scale, glyph, size: frame.size, dx: frame.x + (frame.size - width * scale) / 2 - box[0] * scale,
    dy: frame.y + (frame.size - height * scale) / 2 - box[1] * scale };
}

const transformOf = (fit: Fit): string => `translate(${round(fit.dx)} ${round(fit.dy)}) scale(${round(fit.scale)})`;

/**
 * The user's px, written so the FILE paints it (2026-11-19). The cell group carries
 * the fitting `scale()` (a 24 px icon in an 80 px box is scaled 3.24×), so a width
 * written verbatim was multiplied by it: a "1 px" stroke painted 3.24 px on the
 * sheet, and that local number went straight into the shipped SVG and the EPS — a
 * pen the user never chose, unrelated to the editor's number. A stroke is an
 * ABSOLUTE width (the same rule the SVG-to-upload flow applies: one final px), so
 * the width written here is the user's px DIVIDED by that scale: after the group's
 * own transform multiplies it back, the artboard, the JPEG, the SVG and the EPS all
 * paint exactly the px the user typed.
 */
function finalWidthOf(userPx: number, fit: Fit): string {
  return String(Number((userPx / fit.scale).toFixed(4)));
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
