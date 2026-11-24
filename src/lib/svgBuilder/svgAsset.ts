// svgAsset.ts — turns one approved SVG file into a safe, fitted cell group
// with geometry baked directly into real artboard px at ≤ 1 decimal place and
// direct `stroke-width` px (no `scale(...)` wrappers, no pen-width compensation
// — RULE 26). Line-stroke icons draw in the sheet's ink and pen; registered
// style icons (`~colored_wiggle`, 2026-11-23) keep their own strokes and fills.
import { extractValidatedIconRoot } from "./svgIconRoot";
import { allElements } from "../upload/svgdom";
import { fnv1a32 } from "../pairing";
import { fmt1 } from "../upload/svgdirectpath";
import { isStyledIcon } from "./iconstyles";
import { markPaints, paintsOf } from "./stylepaint";
import { compilePreparedNodes, renderPreparedNodes, type DirectPlacement, type PreparedNode } from "./svgAssetNodes";
import { inkBoxOf } from "./inkbox";
import type { BuilderIconAsset, CellFrame, SheetConfig } from "./types";

export interface CellSvgArgs {
  code: string;
  asset: BuilderIconAsset;
  frame: CellFrame;
  style: SheetConfig["icons"];
}

export type CellSvgResult = { ok: true; html: string } | { ok: false; error: string };

type Sanitized =
  | { ok: true; nodes: readonly PreparedNode[]; box: [number, number, number, number]; rendered: Map<string, string> }
  | { ok: false; error: string };

/**
 * Sanitised icons, by icon + cell + exact SVG text (2026-11-15, performance):
 * validating, parsing, id-scoping, recolouring and compiling node descriptors
 * runs once on the cold path; warm compositions emit direct artboard geometry
 * by pure arithmetic. Bounded, oldest first out.
 */
const SANITIZED = new Map<string, Sanitized>();
const SANITIZED_MAX = 4000;

/** Tests / measurements: forget every sanitised icon. */
export function clearSanitizedIcons(): void {
  SANITIZED.clear();
}

function sanitizedKey(code: string, assetId: string, index: number): string {
  const slot = /\bid\s*=/i.test(code) ? index : -1;
  return `${assetId}\u0000${slot}\u0000${code.length}\u0000${fnv1a32(code)}`;
}

function sanitizedOf(code: string, assetId: string, index: number): Sanitized {
  const key = sanitizedKey(code, assetId, index);
  const hit = SANITIZED.get(key);
  if (hit !== undefined) return hit;
  const made = sanitize(code, assetId, index);
  if (SANITIZED.size >= SANITIZED_MAX) SANITIZED.delete(SANITIZED.keys().next().value as string);
  SANITIZED.set(key, made);
  return made;
}

function sanitize(code: string, assetId: string, index: number): Sanitized {
  const styled = isStyledIcon(assetId);
  const hasIds = /\bid\s*=/i.test(code);
  const preview = extractValidatedIconRoot(code, !styled && !hasIds);
  if (!preview.ok) return { ok: false, error: preview.error };
  const root = preview.root;
  const box = viewBoxOf(preview.viewBox);
  if (box === null) return { ok: false, error: "approved SVG has no usable viewBox" };
  if (hasIds) scopeLocalIds(root, `b${fnv1a32(`${assetId}:${index}`).toString(16)}`);
  if (styled) markPaints(root);
  const nodes = compilePreparedNodes(root, styled);
  return { ok: true, nodes, box: fitBoxOf(nodes, box, styled ? ownStrokeOf(root) : 0), rendered: new Map() };
}

/**
 * The box a cell fits (2026-11-24): the icon's REAL drawn bounds, not the
 * generator's viewBox / artboard frame, so every icon uses its cell fully.
 * A colored icon's own strokes scale with it, so half its widest pen is added;
 * a line icon's sheet pen is already reserved by the glyph (box − 2.2 × pen).
 * Nothing measurable drawn → the viewBox, as before.
 */
function fitBoxOf(nodes: readonly PreparedNode[], viewBox: [number, number, number, number], pen: number): [number, number, number, number] {
  const ink = inkBoxOf(nodes);
  if (ink === null || (ink[2] <= 0 && ink[3] <= 0)) return viewBox;
  const h = pen / 2;
  return [ink[0] - h, ink[1] - h, ink[2] + pen, ink[3] + pen];
}

/** The widest own stroke of a colored icon, in its viewBox units (a stroke with no width paints 1). */
function ownStrokeOf(root: Element): number {
  let widest = 0;
  for (const el of [root, ...allElements(root)]) {
    const stroke = el.getAttribute("stroke");
    const width = Number.parseFloat(el.getAttribute("stroke-width") ?? "");
    if (Number.isFinite(width)) widest = Math.max(widest, width);
    else if (stroke !== null && stroke !== "none") widest = Math.max(widest, 1);
  }
  return widest;
}

function renderedChildren(s: Extract<Sanitized, { ok: true }>, placed: DirectPlacement): string {
  const key = `${placed.scale}|${placed.dx}|${placed.dy}`;
  const hit = s.rendered.get(key);
  if (hit !== undefined) return hit;
  const built = renderPreparedNodes(s.nodes, placed);
  if (s.rendered.size >= 32) s.rendered.delete(s.rendered.keys().next().value as string);
  s.rendered.set(key, built);
  return built;
}

export function cellGroupOf(args: CellSvgArgs): CellSvgResult {
  const s = sanitizedOf(args.code, args.asset.id, args.frame.index);
  if (!s.ok) return s;
  const placed = placementOf(args.frame, s.box);
  const children = renderedChildren(s, placed);
  const html = isStyledIcon(args.asset.id)
    ? styledGroupOf(args, children, placed)
    : groupOf(args, children);
  return { ok: true, html };
}

function cellMarks(args: CellSvgArgs): string[] {
  return [`data-asset-id="${attr(args.asset.id)}"`, 'data-approved="true"', `data-cell-index="${args.frame.index}"`];
}

function groupOf(args: CellSvgArgs, children: string): string {
  const style = args.style;
  const attrs = [
    ...cellMarks(args),
    'fill="none"', 'stroke="currentColor"', `color="${attr(style.color)}"`,
    `stroke-width="${fmt1(style.strokeWidth, 0.1)}"`, `stroke-linecap="${style.linecap}"`,
    `stroke-linejoin="${style.linecap === "square" ? "miter" : "round"}"`,
  ];
  return `<g ${attrs.join(" ")}>${children}</g>`;
}

/** A colored icon's group (2026-11-23, RULE 26 direct geometry): each element paints itself in direct artboard px. */
function styledGroupOf(args: CellSvgArgs, children: string, placed: DirectPlacement): string {
  const attrs = [...cellMarks(args), `color="${attr(args.style.color)}"`];
  const painted = paintsOf(
    children, args.style,
    (w) => fmt1(w, 0.1),
    (own) => fmt1((Number.parseFloat(own) || 1) * placed.scale, 0.1),
  );
  return `<g ${attrs.join(" ")}>${painted}</g>`;
}

function scopeLocalIds(root: Element, prefix: string): void {
  const elements = allElements(root);
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

/** Fits the ink `box` inside `frame.glyph`, centred in `frame.size`, in direct artboard px. */
function placementOf(frame: CellFrame, box: readonly number[]): DirectPlacement {
  const [, , width, height] = box;
  const glyph = frame.glyph > 0 ? Math.min(frame.glyph, frame.size) : frame.size;
  const scale = glyph / Math.max(width, height); // a zero-width ink (one straight line) scales by its length
  const dx = frame.x + (frame.size - width * scale) / 2 - box[0] * scale;
  const dy = frame.y + (frame.size - height * scale) / 2 - box[1] * scale;
  return { scale, dx, dy };
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

function attr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
