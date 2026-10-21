// EPS paints: deliberately limited solid colors and local gradient references.
import { inheritStroke, styleMap, type Stroke } from "./geom/stroke";
import { fmt } from "./geom";
export class Unsupported extends Error {}
export interface Rgb { r: number; g: number; b: number }

export interface Paint {
  fill: Rgb | { ref: string } | null;
  stroke: Rgb | null;
  strokeWidth: number;
  dash: number[] | null;
  cap: number;
  join: number;
  miter: number;
  fillOpacity: number;
  evenOdd: boolean;
  strokeOpacity: number;
}

// --- paint --------------------------------------------------------------------

const NAMED: Record<string, Rgb> = {
  black: { r: 0, g: 0, b: 0 }, white: { r: 1, g: 1, b: 1 }, red: { r: 1, g: 0, b: 0 },
  green: { r: 0, g: 0.5, b: 0 }, blue: { r: 0, g: 0, b: 1 }, yellow: { r: 1, g: 1, b: 0 },
  cyan: { r: 0, g: 1, b: 1 }, magenta: { r: 1, g: 0, b: 1 }, gray: { r: 0.5, g: 0.5, b: 0.5 },
  grey: { r: 0.5, g: 0.5, b: 0.5 }, silver: { r: 0.75, g: 0.75, b: 0.75 }, maroon: { r: 0.5, g: 0, b: 0 },
  navy: { r: 0, g: 0, b: 0.5 }, olive: { r: 0.5, g: 0.5, b: 0 }, purple: { r: 0.5, g: 0, b: 0.5 },
  teal: { r: 0, g: 0.5, b: 0.5 }, aqua: { r: 0, g: 1, b: 1 }, fuchsia: { r: 1, g: 0, b: 1 },
  lime: { r: 0, g: 1, b: 0 },
};

export function basePaint(): Paint {
  return {
    fill: { r: 0, g: 0, b: 0 }, stroke: null, strokeWidth: 1, dash: null,
    cap: 0, join: 0, miter: 4, fillOpacity: 1, strokeOpacity: 1, evenOdd: false,
  };
}

/** The paint state at an element: cascade + subset checks (throws Unsupported). */
export function resolvePaint(el: Element, parent: Paint): Paint {
  const style = styleMap(el.getAttribute("style"));
  const attr = (key: string) => style[key] ?? el.getAttribute(key);
  const stroke = inheritStroke(el, strokeOf(parent));
  const fillRaw = attr("fill");
  const strokeRaw = attr("stroke");
  return {
    fill: fillRaw === null || fillRaw === "" ? parent.fill : fillPaint(fillRaw),
    stroke: strokeRaw === null || strokeRaw === "" ? parent.stroke : paintOf(strokeRaw),
    strokeWidth: stroke.width,
    dash: dashOf(attr("stroke-dasharray")),
    cap: capOf(attr("stroke-linecap"), stroke.cap),
    join: joinOf(attr("stroke-linejoin"), stroke.join),
    miter: stroke.miter,
    evenOdd: fillRule(attr("fill-rule"), parent.evenOdd),
    fillOpacity: opacityOf(attr("fill-opacity"), parent.fillOpacity),
    strokeOpacity: opacityOf(attr("stroke-opacity"), parent.strokeOpacity),
  };
}

/** The EPS keeps its own RGB paints; the inheritance only needs to know whether it strokes (and fills). */
function strokeOf(p: Paint): Stroke {
  const none = p.stroke === null;
  return { width: p.strokeWidth, paint: none ? "none" : "rgb", none, fillNone: p.fill === null, cap: "butt", join: "miter", miter: p.miter };
}

/** A paint keyword → RGB; "none" → null; anything else → Unsupported. */
export function paintOf(raw: string): Rgb | null {
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

function dashOf(raw: string | null): number[] | null {
  if (raw === null || raw.trim() === "" || raw.trim().toLowerCase() === "none") return null;
  const dashes = raw.trim().split(/[\s,]+/).map(Number);
  if (dashes.some((d) => !Number.isFinite(d) || d < 0)) throw new Unsupported(`unsupported dash: ${raw}`);
  return dashes;
}

export function opacityOf(raw: string | null, inherited: number): number {
  if (raw === null || raw.trim() === "") return inherited;
  const text = raw.trim();
  const value = text.endsWith("%") ? Number(text.slice(0, -1)) / 100 : Number(text);
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Unsupported(`unsupported opacity: ${raw}`);
  return value;
}

/** PS linecap: butt 0, round 1, square 2 (SVG keyword → PostScript). */
function capOf(raw: string | null, inherited: string): number {
  const text = (raw ?? inherited).trim().toLowerCase();
  if (text === "round") return 1;
  if (text === "square") return 2;
  if (text === "butt" || text === "") return 0;
  throw new Unsupported(`unsupported stroke-linecap: ${text}`);
}

/** PS linejoin: miter 0, round 1, bevel 2 (SVG keyword → PostScript). */
function joinOf(raw: string | null, inherited: string): number {
  const text = (raw ?? inherited).trim().toLowerCase();
  if (text === "round") return 1;
  if (text === "bevel") return 2;
  if (text === "miter" || text === "") return 0;
  throw new Unsupported(`unsupported stroke-linejoin: ${text}`);
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


function fillPaint(raw: string): Rgb | { ref: string } | null {
  const match = /^url\(\s*["']?#([^\s"')]+)["']?\s*\)$/.exec(raw.trim());
  return match === null ? paintOf(raw) : { ref: match[1] };
}
export function strokePs(paint: Paint, bg: Rgb): string {
  const dash = paint.dash === null ? "" : ` [${paint.dash.map(fmt).join(" ")}] 0 setdash`;
  return ` ${psColor(mix(paint.stroke as Rgb, bg, paint.strokeOpacity))} setrgbcolor`
    + ` ${fmt(paint.strokeWidth)} setlinewidth${dash}`
    + ` ${paint.cap} setlinecap ${paint.join} setlinejoin ${fmt(paint.miter)} setmiterlimit stroke`;
}


function fillRule(raw: string | null, inherited: boolean): boolean {
  if (raw === null) return inherited;
  if (!["evenodd", "nonzero"].includes(raw)) throw new Unsupported("unsupported EPS fill-rule");
  return raw === "evenodd";
}
