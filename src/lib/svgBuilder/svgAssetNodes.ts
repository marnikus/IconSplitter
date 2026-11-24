// svgAssetNodes.ts — compiles sanitised SVG elements once (cold path) into pure
// JS geometry descriptors and renders them directly into target artboard px at
// ≤ 1 decimal place on every sheet/hero composition (warm path, zero DOMParser,
// zero `scale(...)` wrappers, zero `xmlns` child spam — RULE 26).
import { bakeGeometry } from "../upload/bake";
import { identity, parseTransform } from "../upload/geom/matrix";
import { emitPathCommands, fmt1, scanPathCommands, type PathCmd } from "../upload/svgdirectpath";
import { attr } from "./markup";

const UNSAFE = new Set(["script", "foreignobject", "handler", "listener", "iframe", "object", "embed"]);
const DROP_BASE = new Set(["xmlns", "transform", "style", "vector-effect"]);
const DROP_STROKE = new Set([
  "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "stroke-miterlimit",
]);

export interface DirectPlacement {
  scale: number;
  dx: number;
  dy: number;
}

export type PreparedNode =
  | { kind: "path"; attrs: [string, string][]; cmds: readonly PathCmd[]; s: number; dx: number; dy: number }
  | { kind: "rect"; attrs: [string, string][]; x: number; y: number; w: number; h: number; rx: number | null; ry: number | null }
  | { kind: "circle"; attrs: [string, string][]; cx: number; cy: number; r: number }
  | { kind: "ellipse"; attrs: [string, string][]; cx: number; cy: number; rx: number; ry: number }
  | { kind: "line"; attrs: [string, string][]; x1: number; y1: number; x2: number; y2: number }
  | { kind: "poly"; tag: "polyline" | "polygon"; attrs: [string, string][]; pts: number[] }
  | { kind: "use"; attrs: [string, string][]; x: number; y: number; w: number | null; h: number | null }
  | { kind: "group"; tag: string; attrs: [string, string][]; children: PreparedNode[] };

const GEOM_OWNED: Record<string, ReadonlySet<string>> = {
  path: new Set(["d"]),
  rect: new Set(["x", "y", "width", "height", "rx", "ry"]),
  circle: new Set(["cx", "cy", "r"]),
  ellipse: new Set(["cx", "cy", "rx", "ry"]),
  line: new Set(["x1", "y1", "x2", "y2"]),
  polyline: new Set(["points"]),
  polygon: new Set(["points"]),
  use: new Set(["x", "y", "width", "height"]),
};

function numOf(el: Element, name: string, fallback = 0): number {
  const raw = el.getAttribute(name);
  if (raw === null) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function optNumOf(el: Element, name: string): number | null {
  const raw = el.getAttribute(name);
  if (raw === null) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

const DROP_UNSTYLED = new Set(["opacity", "fill-opacity", "stroke-opacity", "fill", "stroke"]);
const DRAWABLE_SHAPES = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "use"]);

function isDroppedAttr(name: string, owned: ReadonlySet<string> | undefined, keepStrokes: boolean): boolean {
  if (DROP_BASE.has(name) || name.startsWith("xmlns:")) return true;
  if (!keepStrokes && (DROP_STROKE.has(name) || DROP_UNSTYLED.has(name))) return true;
  return owned !== undefined && owned.has(name);
}

function keptAttrs(el: Element, tag: string, keepStrokes: boolean): [string, string][] {
  const owned = GEOM_OWNED[tag];
  const out: [string, string][] = [];
  const attrs = el.attributes;
  for (let i = 0; i < attrs.length; i += 1) {
    const a = attrs[i];
    if (!isDroppedAttr(a.name, owned, keepStrokes)) out.push([a.name, a.value]);
  }
  if (!keepStrokes && DRAWABLE_SHAPES.has(tag)) {
    out.push(["fill", "none"], ["stroke", "currentColor"]);
  }
  return out;
}

function resolveUniform(el: Element): [number, number, number] {
  const raw = el.getAttribute("transform");
  if (!raw || !raw.trim()) return [1, 0, 0];
  const { a, b, c, d, e, f } = parseTransform(raw);
  if (Math.abs(b) <= 1e-6 && Math.abs(c) <= 1e-6 && a > 1e-6 && Math.abs(a - d) <= 1e-6) {
    return [a, e, f];
  }
  bakeGeometry(el, identity());
  return [1, 0, 0];
}

function compileRectOrRound(
  el: Element, tag: string, attrs: [string, string][], xform: [number, number, number],
): PreparedNode | null {
  const [s, dx, dy] = xform;
  if (tag === "rect") {
    const rx = optNumOf(el, "rx");
    const ry = optNumOf(el, "ry");
    return {
      kind: "rect", attrs,
      x: dx + s * numOf(el, "x"), y: dy + s * numOf(el, "y"),
      w: s * numOf(el, "width"), h: s * numOf(el, "height"),
      rx: rx === null ? null : s * rx, ry: ry === null ? null : s * ry,
    };
  }
  if (tag === "circle") {
    return { kind: "circle", attrs, cx: dx + s * numOf(el, "cx"), cy: dy + s * numOf(el, "cy"), r: s * numOf(el, "r") };
  }
  if (tag === "ellipse") {
    return {
      kind: "ellipse", attrs,
      cx: dx + s * numOf(el, "cx"), cy: dy + s * numOf(el, "cy"),
      rx: s * numOf(el, "rx"), ry: s * numOf(el, "ry"),
    };
  }
  return null;
}

function compilePolyNode(
  el: Element, tag: "polyline" | "polygon", attrs: [string, string][], xform: [number, number, number],
): PreparedNode {
  const [s, dx, dy] = xform;
  const raw = (el.getAttribute("points") ?? "").match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const pts: number[] = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    pts.push(dx + s * Number(raw[i]), dy + s * Number(raw[i + 1]));
  }
  return { kind: "poly", tag, attrs, pts };
}

function compileLeaf(el: Element, tag: string, xform: [number, number, number], keepStrokes: boolean): PreparedNode | null {
  const [s, dx, dy] = xform;
  const attrs = keptAttrs(el, tag, keepStrokes);
  if (tag === "path") return { kind: "path", attrs, cmds: scanPathCommands(el.getAttribute("d") ?? ""), s, dx, dy };
  const boxOrRound = compileRectOrRound(el, tag, attrs, xform);
  if (boxOrRound !== null) return boxOrRound;
  if (tag === "line") {
    return {
      kind: "line", attrs,
      x1: dx + s * numOf(el, "x1"), y1: dy + s * numOf(el, "y1"),
      x2: dx + s * numOf(el, "x2"), y2: dy + s * numOf(el, "y2"),
    };
  }
  if (tag === "polyline" || tag === "polygon") return compilePolyNode(el, tag, attrs, xform);
  if (tag === "use") {
    const w = optNumOf(el, "width");
    const h = optNumOf(el, "height");
    return { kind: "use", attrs, x: dx + s * numOf(el, "x"), y: dy + s * numOf(el, "y"), w: w === null ? null : s * w, h: h === null ? null : s * h };
  }
  return null;
}

function compileElementInto(el: Element, parent: [number, number, number], keepStrokes: boolean, out: PreparedNode[]): void {
  const tag = el.localName.toLowerCase();
  if (UNSAFE.has(tag) || tag === "metadata" || tag === "title" || tag === "desc") return;
  const [ls, ldx, ldy] = resolveUniform(el);
  const cur: [number, number, number] = [parent[0] * ls, parent[1] + parent[0] * ldx, parent[2] + parent[0] * ldy];
  const leaf = compileLeaf(el, tag, cur, keepStrokes);
  if (leaf !== null) { out.push(leaf); return; }
  const children: PreparedNode[] = [];
  for (let c = el.firstElementChild; c !== null; c = c.nextElementSibling) {
    compileElementInto(c, cur, keepStrokes, children);
  }
  if (children.length === 0) return;
  const attrs = keptAttrs(el, tag, keepStrokes);
  if (tag === "g" && attrs.length === 0) { out.push(...children); return; }
  out.push({ kind: "group", tag, attrs, children });
}

export function compilePreparedNodes(root: Element, keepStrokes = false): PreparedNode[] {
  const out: PreparedNode[] = [];
  for (let c = root.firstElementChild; c !== null; c = c.nextElementSibling) {
    compileElementInto(c, [1, 0, 0], keepStrokes, out);
  }
  return out;
}

function fmtAttrs(pairs: readonly [string, string][]): string {
  if (pairs.length === 0) return "";
  return " " + pairs.map(([k, v]) => `${k}="${attr(v)}"`).join(" ");
}

function renderBoxOrRound(node: Extract<PreparedNode, { kind: "rect" | "circle" | "ellipse" }>, p: DirectPlacement): string {
  const { scale: s, dx, dy } = p;
  if (node.kind === "rect") {
    const rx = node.rx === null ? "" : ` rx="${fmt1(s * node.rx)}"`;
    const ry = node.ry === null ? "" : ` ry="${fmt1(s * node.ry)}"`;
    return `<rect x="${fmt1(dx + s * node.x)}" y="${fmt1(dy + s * node.y)}" width="${fmt1(s * node.w)}" height="${fmt1(s * node.h)}"${rx}${ry}${fmtAttrs(node.attrs)}/>`;
  }
  if (node.kind === "circle") {
    const r = node.r > 0 ? fmt1(s * node.r, 0.1) : "0";
    return `<circle cx="${fmt1(dx + s * node.cx)}" cy="${fmt1(dy + s * node.cy)}" r="${r}"${fmtAttrs(node.attrs)}/>`;
  }
  const rx = node.rx > 0 ? fmt1(s * node.rx, 0.1) : "0";
  const ry = node.ry > 0 ? fmt1(s * node.ry, 0.1) : "0";
  return `<ellipse cx="${fmt1(dx + s * node.cx)}" cy="${fmt1(dy + s * node.cy)}" rx="${rx}" ry="${ry}"${fmtAttrs(node.attrs)}/>`;
}

function renderPoly(node: Extract<PreparedNode, { kind: "poly" }>, p: DirectPlacement): string {
  const pairs: string[] = [];
  for (let i = 0; i + 1 < node.pts.length; i += 2) {
    pairs.push(`${fmt1(p.dx + p.scale * node.pts[i])},${fmt1(p.dy + p.scale * node.pts[i + 1])}`);
  }
  return `<${node.tag} points="${pairs.join(" ")}"${fmtAttrs(node.attrs)}/>`;
}

function renderUse(node: Extract<PreparedNode, { kind: "use" }>, p: DirectPlacement): string {
  const w = node.w === null ? "" : ` width="${fmt1(p.scale * node.w)}"`;
  const h = node.h === null ? "" : ` height="${fmt1(p.scale * node.h)}"`;
  return `<use x="${fmt1(p.dx + p.scale * node.x)}" y="${fmt1(p.dy + p.scale * node.y)}"${w}${h}${fmtAttrs(node.attrs)}/>`;
}

function renderNode(node: PreparedNode, p: DirectPlacement): string {
  const { scale: s, dx, dy } = p;
  if (node.kind === "path") {
    const d = emitPathCommands(node.cmds, { scale: s * node.s, dx: dx + s * node.dx, dy: dy + s * node.dy });
    return d === "" ? "" : `<path d="${d}"${fmtAttrs(node.attrs)}/>`;
  }
  if (node.kind === "rect" || node.kind === "circle" || node.kind === "ellipse") return renderBoxOrRound(node, p);
  if (node.kind === "line") {
    return `<line x1="${fmt1(dx + s * node.x1)}" y1="${fmt1(dy + s * node.y1)}" x2="${fmt1(dx + s * node.x2)}" y2="${fmt1(dy + s * node.y2)}"${fmtAttrs(node.attrs)}/>`;
  }
  if (node.kind === "poly") return renderPoly(node, p);
  if (node.kind === "use") return renderUse(node, p);
  const inner = node.children.map((c) => renderNode(c, p)).join("");
  return inner === "" ? "" : `<${node.tag}${fmtAttrs(node.attrs)}>${inner}</${node.tag}>`;
}

export function renderPreparedNodes(nodes: readonly PreparedNode[], p: DirectPlacement): string {
  return nodes.map((n) => renderNode(n, p)).join("");
}
