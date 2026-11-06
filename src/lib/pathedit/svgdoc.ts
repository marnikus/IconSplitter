// svgdoc.ts — the icon file around the edited shapes (2026-11-06). Every DRAWN
// shape is an object of the editor: <path>, <circle>, <ellipse>, <rect>,
// <line>, <polyline> and <polygon> (inside <defs>, <clipPath>, <mask>,
// <symbol>, <marker> or <pattern> nothing is drawn where it stands, so those
// are skipped). Each is found by its tag in the source text (comments and CDATA
// skipped), numbered in document order and read as path data. Writing changes
// ONE shape and nothing else: a path gets a new `d`; a basic shape becomes a
// <path> with that `d`, keeping every other attribute (its geometry attributes
// go). The preview copy carries the number as `data-edit-path`. Pure.

export type ShapeKind = "path" | "circle" | "ellipse" | "rect" | "line" | "polyline" | "polygon";

export interface PathTag {
  index: number;
  kind: ShapeKind;
  start: number;
  end: number;
  /** The shape as path data (a path's own `d`). */
  d: string | null;
  selfClosing: boolean;
}

const D_ATTR = /\sd\s*=\s*("([^"]*)"|'([^']*)')/;
const SHAPE_TAG = /<(path|circle|ellipse|rect|line|polyline|polygon)\b[^>]*>/gi;
const NOT_DRAWN = /<(defs|clipPath|mask|symbol|marker|pattern)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
/** The attributes that only describe a shape's geometry (they go when it becomes a <path>). */
export const GEOMETRY: Record<ShapeKind, string[]> = {
  path: ["d"], circle: ["cx", "cy", "r"], ellipse: ["cx", "cy", "rx", "ry"], rect: ["x", "y", "width", "height", "rx", "ry"],
  line: ["x1", "y1", "x2", "y2"], polyline: ["points"], polygon: ["points"],
};

/** Comments, CDATA and never-drawn containers blanked (same length) so their shapes are not counted. */
function blanked(markup: string): string {
  const blank = (m: string) => " ".repeat(m.length);
  return markup.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, blank).replace(NOT_DRAWN, blank);
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(tag);
  return m === null ? null : (m[2] ?? m[3]);
}

const num = (tag: string, name: string): number => Number.parseFloat(attr(tag, name) ?? "0") || 0;
const f = (n: number): string => String(Math.round(n * 10000) / 10000);
const K = 0.5522847498;

/** An ellipse as four cubic quarter arcs, starting at its right-most point. */
function ellipseD(cx: number, cy: number, rx: number, ry: number): string | null {
  if (rx <= 0 || ry <= 0) return null;
  const kx = rx * K, ky = ry * K;
  return `M${f(cx + rx)} ${f(cy)}C${f(cx + rx)} ${f(cy + ky)} ${f(cx + kx)} ${f(cy + ry)} ${f(cx)} ${f(cy + ry)}`
    + `C${f(cx - kx)} ${f(cy + ry)} ${f(cx - rx)} ${f(cy + ky)} ${f(cx - rx)} ${f(cy)}`
    + `C${f(cx - rx)} ${f(cy - ky)} ${f(cx - kx)} ${f(cy - ry)} ${f(cx)} ${f(cy - ry)}`
    + `C${f(cx + kx)} ${f(cy - ry)} ${f(cx + rx)} ${f(cy - ky)} ${f(cx + rx)} ${f(cy)}Z`;
}

function rectD(tag: string): string | null {
  const [x, y, w, h] = [num(tag, "x"), num(tag, "y"), num(tag, "width"), num(tag, "height")];
  if (w <= 0 || h <= 0) return null;
  return `M${f(x)} ${f(y)}L${f(x + w)} ${f(y)}L${f(x + w)} ${f(y + h)}L${f(x)} ${f(y + h)}Z`;
}

function pointsD(tag: string, closed: boolean): string | null {
  const nums = (attr(tag, "points") ?? "").trim().split(/[\s,]+/).map(Number).filter((v) => Number.isFinite(v));
  if (nums.length < 4) return null;
  const pairs: string[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pairs.push(`${i === 0 ? "M" : "L"}${f(nums[i])} ${f(nums[i + 1])}`);
  return pairs.join("") + (closed ? "Z" : "");
}

/** The shape as path data. */
function shapeD(kind: ShapeKind, tag: string): string | null {
  if (kind === "path") { const m = D_ATTR.exec(tag); return m === null ? null : (m[2] ?? m[3]); }
  if (kind === "circle") return ellipseD(num(tag, "cx"), num(tag, "cy"), num(tag, "r"), num(tag, "r"));
  if (kind === "ellipse") return ellipseD(num(tag, "cx"), num(tag, "cy"), num(tag, "rx"), num(tag, "ry"));
  if (kind === "rect") return rectD(tag);
  if (kind === "line") return `M${f(num(tag, "x1"))} ${f(num(tag, "y1"))}L${f(num(tag, "x2"))} ${f(num(tag, "y2"))}`;
  return pointsD(tag, kind === "polygon");
}

/** Every drawn shape's start tag in document order, with its path data. */
export function pathTags(markup: string): PathTag[] {
  const out: PathTag[] = [];
  const text = blanked(markup);
  SHAPE_TAG.lastIndex = 0;
  for (let m = SHAPE_TAG.exec(text); m !== null; m = SHAPE_TAG.exec(text)) {
    const tag = markup.slice(m.index, m.index + m[0].length);
    const kind = m[1].toLowerCase() as ShapeKind;
    out.push({ index: out.length, kind, start: m.index, end: m.index + m[0].length, d: shapeD(kind, tag), selfClosing: /\/\s*>$/.test(tag) });
  }
  return out;
}

/** A basic shape's start tag as a <path> with `d`, its geometry attributes removed. */
function asPathTag(t: PathTag, tag: string, d: string): string {
  let rest = tag.replace(new RegExp(`^<${t.kind}\\b`, "i"), "");
  for (const name of GEOMETRY[t.kind]) rest = rest.replace(new RegExp(`\\s${name}\\s*=\\s*("[^"]*"|'[^']*')`), "");
  return `<path d="${d}"${rest}`;
}

/** The file with shape `index` drawn by `d` (a basic shape becomes a <path>); null when there is no such shape. */
export function withPathD(markup: string, index: number, d: string): string | null {
  const t = pathTags(markup)[index];
  if (t === undefined) return null;
  const old = markup.slice(t.start, t.end);
  if (t.kind === "path") {
    const next = D_ATTR.test(old) ? old.replace(D_ATTR, ` d="${d}"`) : old.replace(/^<path\b/i, `<path d="${d}"`);
    return markup.slice(0, t.start) + next + markup.slice(t.end);
  }
  let after = markup.slice(t.end);
  if (!t.selfClosing) after = after.replace(new RegExp(`</${t.kind}\\s*>`, "i"), "</path>");
  return markup.slice(0, t.start) + asPathTag(t, old, d) + after;
}

/** The preview copy: each drawn shape tagged with its number, so a click names the shape it hit. */
export function annotatePaths(markup: string): string {
  let out = markup;
  for (const t of pathTags(markup).reverse()) {
    const name = `<${markup.slice(t.start + 1, t.start + 1 + t.kind.length)}`;
    out = `${out.slice(0, t.start)}${name} data-edit-path="${t.index}"${out.slice(t.start + name.length)}`;
  }
  return out;
}
