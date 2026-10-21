// epsgradient.ts — SVG paint colours + <linearGradient>/<radialGradient> collection
// for the built-in Level-3 PostScript EPS writer (RULE 3: one colour/gradient model).

import { fmt } from "./geom";
import { parseTransform, type Matrix } from "./geom/matrix";
import { styleMap } from "./geom/stroke";

export class Unsupported extends Error {}

export interface Rgb { r: number; g: number; b: number }

export interface GradStop {
  offset: number;
  color: Rgb;
  opacity: number;
}

export interface EpsGradient {
  kind: "linear" | "radial";
  units: "objectBoundingBox" | "userSpaceOnUse";
  transform: Matrix;
  attrs: Record<string, string>;
  stops: GradStop[];
}

const NAMED: Record<string, Rgb> = {
  black: { r: 0, g: 0, b: 0 }, white: { r: 1, g: 1, b: 1 }, red: { r: 1, g: 0, b: 0 },
  green: { r: 0, g: 0.5, b: 0 }, blue: { r: 0, g: 0, b: 1 }, yellow: { r: 1, g: 1, b: 0 },
  cyan: { r: 0, g: 1, b: 1 }, magenta: { r: 1, g: 0, b: 1 }, gray: { r: 0.5, g: 0.5, b: 0.5 },
  grey: { r: 0.5, g: 0.5, b: 0.5 }, silver: { r: 0.75, g: 0.75, b: 0.75 }, maroon: { r: 0.5, g: 0, b: 0 },
  navy: { r: 0, g: 0, b: 0.5 }, olive: { r: 0.5, g: 0.5, b: 0 }, purple: { r: 0.5, g: 0, b: 0.5 },
  teal: { r: 0, g: 0.5, b: 0.5 }, aqua: { r: 0, g: 1, b: 1 }, fuchsia: { r: 1, g: 0, b: 1 },
  lime: { r: 0, g: 1, b: 0 },
};

const GRAD_ATTRS = ["gradientUnits", "gradientTransform", "spreadMethod", "x1", "y1", "x2", "y2", "cx", "cy", "r", "fx", "fy", "fr"];

/** Collect every id-bearing <linearGradient> and <radialGradient> in `root`. */
export function collectGradients(root: Element): Map<string, Element> {
  const raw = new Map<string, Element>();
  for (const el of Array.from(root.querySelectorAll("*"))) {
    const tag = el.nodeName.toLowerCase();
    const id = el.getAttribute("id");
    if (id !== null && (tag === "lineargradient" || tag === "radialgradient")) raw.set(id, el);
  }
  return raw;
}

/** Extract `id` from `url(#id)` if present; null for non-url paints. */
export function urlRefId(raw: string): string | null {
  const m = /^url\(\s*#([^)\s"']+)\s*\)$/i.exec(raw.trim());
  return m === null ? null : m[1];
}

/** Resolve one referenced gradient element (following `href` / `xlink:href` chains). */
export function resolveGradient(id: string, table: Map<string, Element>): EpsGradient {
  const chain = followChain(id, table);
  const leaf = chain[0];
  const attrs = mergeAttrs(chain);
  const spread = (attrs.spreadMethod ?? "pad").trim().toLowerCase();
  if (spread !== "pad") throw new Unsupported(`unsupported gradient spreadMethod: ${spread}`);
  const units = parseUnits(attrs.gradientUnits);
  const stopHost = chain.find((el) => stopChildren(el).length > 0) ?? leaf;
  return {
    kind: leaf.nodeName.toLowerCase() === "radialgradient" ? "radial" : "linear",
    units,
    transform: parseTransform(attrs.gradientTransform ?? null),
    attrs,
    stops: parseStops(stopChildren(stopHost)),
  };
}

function followChain(startId: string, table: Map<string, Element>): Element[] {
  const seen = new Set<string>();
  const chain: Element[] = [];
  let cur: string | null = startId;
  while (cur !== null) {
    if (seen.has(cur)) throw new Unsupported(`cyclic gradient href: #${cur}`);
    seen.add(cur);
    const el = table.get(cur);
    if (el === undefined) throw new Unsupported(`unsupported paint: url(#${startId})`);
    chain.push(el);
    cur = hrefTarget(el);
  }
  return chain;
}

function hrefTarget(el: Element): string | null {
  const ref = (el.getAttribute("href") ?? el.getAttribute("xlink:href") ?? "").trim();
  return ref.startsWith("#") && ref.length > 1 ? ref.slice(1) : null;
}

function mergeAttrs(chain: Element[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = chain.length - 1; i >= 0; i--) {
    for (const key of GRAD_ATTRS) {
      const val = chain[i].getAttribute(key);
      if (val !== null) out[key] = val;
    }
  }
  return out;
}

function parseUnits(raw: string | undefined): "objectBoundingBox" | "userSpaceOnUse" {
  const text = (raw ?? "objectBoundingBox").trim();
  if (text === "objectBoundingBox" || text === "userSpaceOnUse") return text;
  throw new Unsupported(`unsupported gradientUnits: ${text}`);
}

function stopChildren(el: Element): Element[] {
  return Array.from(el.children).filter((c) => c.nodeName.toLowerCase() === "stop");
}

function parseStops(nodes: Element[]): GradStop[] {
  const out: GradStop[] = [];
  let prev = 0;
  for (const node of nodes) {
    const st = styleMap(node.getAttribute("style"));
    const offset = Math.max(prev, stopOffset(st.offset ?? node.getAttribute("offset")));
    const colorRaw = st["stop-color"] ?? node.getAttribute("stop-color");
    const color = colorRaw === null || colorRaw.trim() === "" ? { r: 0, g: 0, b: 0 } : solidColor(colorRaw);
    const opacity = opacityValue(st["stop-opacity"] ?? node.getAttribute("stop-opacity"), 1);
    out.push({ offset, color, opacity });
    prev = offset;
  }
  return out;
}

function stopOffset(raw: string | null): number {
  if (raw === null || raw.trim() === "") return 0;
  const text = raw.trim();
  const n = text.endsWith("%") ? Number(text.slice(0, -1)) / 100 : Number(text);
  if (!Number.isFinite(n)) throw new Unsupported(`unsupported stop offset: ${raw}`);
  return Math.min(1, Math.max(0, n));
}

function solidColor(raw: string): Rgb {
  const parsed = paintColor(raw);
  if (parsed === null) throw new Unsupported(`unsupported stop-color: ${raw}`);
  return parsed;
}

/** A paint keyword → RGB; "none" → null; anything else → Unsupported. */
export function paintColor(raw: string): Rgb | null {
  const text = raw.trim().toLowerCase();
  if (text === "none") return null;
  if (text.startsWith("#")) return hexPaint(text);
  const fn = /^rgba?\(([^)]*)\)$/.exec(text);
  if (fn !== null) return rgbPaint(fn[1]);
  const named = NAMED[text];
  if (named !== undefined) return named;
  throw new Unsupported(`unsupported paint: ${raw.trim()}`);
}

function hexPaint(text: string): Rgb {
  const hex = text.slice(1);
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/.test(hex)) throw new Unsupported(`unsupported paint: ${text}`);
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  };
}

function rgbPaint(args: string): Rgb {
  const parts = args.split(/[\s,]+/).filter((p) => p !== "");
  if (parts.length !== 3) throw new Unsupported(`unsupported paint: rgb(${args})`);
  const channels = parts.map((p) => (p.endsWith("%") ? Number(p.slice(0, -1)) / 100 : Number(p) / 255));
  if (channels.some((c) => !Number.isFinite(c) || c < 0 || c > 1)) {
    throw new Unsupported(`unsupported paint: rgb(${args})`);
  }
  return { r: channels[0], g: channels[1], b: channels[2] };
}

export function opacityValue(raw: string | null, inherited: number): number {
  if (raw === null || raw.trim() === "") return inherited;
  const text = raw.trim();
  const value = text.endsWith("%") ? Number(text.slice(0, -1)) / 100 : Number(text);
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Unsupported(`unsupported opacity: ${raw}`);
  return value;
}

/** Opacity flattened onto the export background (PostScript has no alpha). */
export function mix(color: Rgb, bg: Rgb, alpha: number): Rgb {
  return {
    r: alpha * color.r + (1 - alpha) * bg.r,
    g: alpha * color.g + (1 - alpha) * bg.g,
    b: alpha * color.b + (1 - alpha) * bg.b,
  };
}

export function psColor(c: Rgb): string {
  return `${fmt(c.r)} ${fmt(c.g)} ${fmt(c.b)}`;
}
