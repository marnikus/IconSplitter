// svgAsset.ts — turns one approved SVG file into a safe, fitted cell group.
// Reuses the app's validated preview sanitizer, then recolours the artwork for
// the sheet. Preview, artboard and export all use this same source.
import { buildSvgPreview } from "../svgpreview";
import { validateSvg } from "../svgvalidate";
import { fnv1a32 } from "../pairing";
import type { BuilderIconAsset, CellFrame, SheetConfig } from "./types";

const DRAWABLE = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "use"]);
const UNSAFE = new Set(["script", "foreignobject", "handler", "listener", "iframe", "object", "embed"]);

export interface CellSvgArgs {
  code: string;
  asset: BuilderIconAsset;
  frame: CellFrame;
  style: SheetConfig["icons"];
}

export type CellSvgResult = { ok: true; html: string } | { ok: false; error: string };

export function cellGroupOf(args: CellSvgArgs): CellSvgResult {
  const check = validateSvg(args.code);
  if (!check.ok) return { ok: false, error: check.errors[0] ?? "invalid approved SVG" };
  const preview = buildSvgPreview(args.code);
  if (!preview.ok) return { ok: false, error: preview.error ?? "cannot fit approved SVG" };
  const doc = new DOMParser().parseFromString(preview.html, "image/svg+xml");
  if (doc.getElementsByTagName("parsererror").length > 0 || name(doc.documentElement) !== "svg") {
    return { ok: false, error: "sanitized SVG could not be embedded" };
  }
  const root = doc.documentElement;
  const box = viewBoxOf(preview.viewBox);
  if (box === null) return { ok: false, error: "approved SVG has no usable viewBox" };
  const prefix = `b${fnv1a32(`${args.asset.id}:${args.frame.index}`).toString(16)}`;
  scopeLocalIds(root, prefix);
  recolor(root);
  return { ok: true, html: groupOf(args, root, box, transformOf(args.frame, box)) };
}

function groupOf(args: CellSvgArgs, root: Element, box: readonly number[], transform: string): string {
  const style = args.style;
  const attrs = [
    `data-asset-id="${attr(args.asset.id)}"`, 'data-approved="true"',
    `data-cell-index="${args.frame.index}"`, `transform="${transform}"`,
    'fill="none"', 'stroke="currentColor"', `color="${attr(style.color)}"`,
    `stroke-width="${style.strokeWidth}"`, `stroke-linecap="${style.linecap}"`,
    `stroke-linejoin="${style.linecap === "square" ? "miter" : "round"}"`, `data-view-box="${attr(box.join(" "))}"`,
  ];
  return `<g ${attrs.join(" ")}>${childrenOf(root)}</g>`;
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
    if (!DRAWABLE.has(name(el))) continue;
    el.setAttribute("fill", "none");
    el.setAttribute("stroke", "currentColor");
    el.setAttribute("vector-effect", "non-scaling-stroke");
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

/** Stroke-aware bounds: the artwork fits `frame.glyph`, centred inside the `frame.size` box. */
function transformOf(frame: CellFrame, box: readonly number[]): string {
  const [, , width, height] = box;
  const glyph = frame.glyph > 0 ? Math.min(frame.glyph, frame.size) : frame.size;
  const scale = Math.min(glyph / width, glyph / height);
  const dx = frame.x + (frame.size - width * scale) / 2 - box[0] * scale;
  const dy = frame.y + (frame.size - height * scale) / 2 - box[1] * scale;
  return `translate(${round(dx)} ${round(dy)}) scale(${round(scale)})`;
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
