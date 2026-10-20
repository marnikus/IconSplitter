/// <reference types="vite/client" />
// A fixed vector badge: the user's seven paths, uniformly baked into a corner
// of the FINAL artboard. It does not participate in fitting the icon.
import badgeTemplate from "../../svg/templates/editable-stroke-width.svg?raw";
import { fmt } from "./geom";
import { pathOutline, outlineToPathData, transformOutline, type Outline } from "./geom/outline";
import type { Matrix } from "./geom/matrix";
import { styleMap } from "./geom/stroke";
import { insideArtboard } from "./place";

const SVG_NS = "http://www.w3.org/2000/svg";
const SOURCE_W = 412;
const SOURCE_H = 20;

export type BadgeCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export interface BadgePlacement {
  corner: BadgeCorner;
  widthPct: number;
  offsetXPct: number;
  offsetYPct: number;
}
export interface BadgeBounds { x: number; y: number; width: number; height: number }
export type BadgeResult = { ok: true; bounds: BadgeBounds; paths: Element[] }
  | { ok: false; code: "no-fit" | "unsupported"; detail: string };

interface SourcePath { outline: Outline; fill: boolean }

/** Append the seven opaque paths last; on a refusal the export tree is untouched. */
export function appendCornerBadge(
  root: Element, artboard: { width: number; height: number }, placement: BadgePlacement,
): BadgeResult {
  const source = readBadgeSource();
  if (source === null) return unsupported("the bundled corner badge is malformed or exceeds its own viewport");
  if (!validArtboard(root, artboard) || !validPlacement(placement)) return unsupported("invalid corner badge artboard or percentages");
  if (rootOpacityBlocksBadge(root)) return unsupported("the source root opacity, display or visibility would hide or fade the corner badge");
  const bounds = badgeBounds(artboard, placement);
  if (bounds === null) return noFit();
  const scale = bounds.width / SOURCE_W;
  const stroke = Number(fmt(1.5 * scale));
  if (!(stroke > 0)) return noFit();
  const paths = source.map((item) => bakedPath(root, item, bounds, stroke));
  if (!badgeFits(root, artboard, paths)) return noFit();
  for (const path of paths) root.appendChild(path);
  return { ok: true, bounds, paths };
}

/** The template is deliberately narrow: exact viewport and seven known solid paths. */
function readBadgeSource(): SourcePath[] | null {
  const doc = new DOMParser().parseFromString(badgeTemplate, "image/svg+xml");
  const root = doc.documentElement;
  if (doc.querySelector("parsererror") !== null || root.nodeName !== "svg"
    || root.getAttribute("viewBox") !== "0 0 412 20" || root.getAttribute("fill") !== "none") return null;
  const paths = Array.from(root.children);
  if (paths.length !== 7 || paths.some((path) => path.nodeName !== "path") || !insideArtboard(root)) return null;
  const source = paths.map((path, index) => readSourcePath(path, index));
  return source.some((path) => path === null) ? null : source as SourcePath[];
}

/** One glyph fill, six black outline paths; reject any paint the EPS cannot draw. */
function readSourcePath(el: Element, index: number): SourcePath | null {
  const filled = index === 0;
  const paintOk = filled ? el.getAttribute("fill") === "black" && !el.hasAttribute("stroke")
    : el.getAttribute("stroke") === "black" && el.getAttribute("stroke-width") === "1.5" && !el.hasAttribute("fill");
  const outline = pathOutline(el.getAttribute("d"));
  return paintOk && outline !== null ? { outline, fill: filled } : null;
}

/** Percentages name distances from the selected edges of the emitted viewBox. */
function badgeBounds(board: { width: number; height: number }, p: BadgePlacement): BadgeBounds | null {
  const mx = board.width * p.offsetXPct / 100;
  const my = board.height * p.offsetYPct / 100;
  const width = Math.min(board.width * p.widthPct / 100, board.width - mx, (board.height - my) * SOURCE_W / SOURCE_H);
  const height = width * SOURCE_H / SOURCE_W;
  if (!(Number(fmt(width)) > 0) || !(Number(fmt(height)) > 0)) return null;
  return {
    x: p.corner.endsWith("left") ? mx : board.width - mx - width,
    y: p.corner.startsWith("top") ? my : board.height - my - height,
    width, height,
  };
}

/** The root's viewport must be the one the caller measured, and have paintable area. */
function validArtboard(root: Element, board: { width: number; height: number }): boolean {
  const vb = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  return root.nodeName === "svg" && vb.length === 4 && vb[0] === 0 && vb[1] === 0
    && [board.width, board.height].every((n) => Number.isFinite(n) && n > 0)
    && vb[2] === board.width && vb[3] === board.height;
}

function validPlacement(p: BadgePlacement): boolean {
  return ["top-left", "top-right", "bottom-left", "bottom-right"].includes(p.corner)
    && [p.widthPct, p.offsetXPct, p.offsetYPct].every(Number.isFinite)
    && p.widthPct >= 1 && p.widthPct <= 100 && p.offsetXPct >= 0 && p.offsetXPct <= 100
    && p.offsetYPct >= 0 && p.offsetYPct <= 100;
}

/** Root opacity cannot be overridden by a child without changing the source. */
function rootOpacityBlocksBadge(root: Element): boolean {
  const style = styleMap(root.getAttribute("style"));
  const own = (name: string) => style[name] ?? root.getAttribute(name);
  const opacity = own("opacity");
  const visibility = own("visibility")?.trim().toLowerCase();
  return own("display")?.trim().toLowerCase() === "none"
    || visibility === "hidden" || visibility === "collapse"
    || (opacity !== null && Number(opacity) !== 1);
}

/** No wrapper transform or inherited source paint is allowed to change the badge. */
function bakedPath(root: Element, source: SourcePath, bounds: BadgeBounds, strokeWidth: number): Element {
  const path = root.ownerDocument.createElementNS(SVG_NS, "path");
  const scale = bounds.width / SOURCE_W;
  const matrix: Matrix = { a: scale, b: 0, c: 0, d: scale, e: bounds.x, f: bounds.y };
  path.setAttribute("d", outlineToPathData(transformOutline(source.outline, matrix)));
  path.setAttribute("fill", source.fill ? "#000000" : "none");
  path.setAttribute("fill-opacity", "1");
  path.setAttribute("fill-rule", "nonzero");
  path.setAttribute("stroke", source.fill ? "none" : "#000000");
  if (!source.fill) setStrokeDefaults(path, strokeWidth);
  return path;
}

/** Override root stroke inheritance, including caps, joins, dashes and opacity. */
function setStrokeDefaults(path: Element, width: number): void {
  path.setAttribute("stroke-width", fmt(width));
  path.setAttribute("stroke-opacity", "1");
  path.setAttribute("stroke-linecap", "butt");
  path.setAttribute("stroke-linejoin", "miter");
  path.setAttribute("stroke-miterlimit", "4");
  path.setAttribute("stroke-dasharray", "none");
  path.setAttribute("stroke-dashoffset", "0");
}

/** Probe only badge paint; source bounds have already been settled separately. */
function badgeFits(root: Element, board: { width: number; height: number }, paths: readonly Element[]): boolean {
  const probe = root.cloneNode(false) as Element;
  probe.setAttribute("viewBox", `0 0 ${fmt(board.width)} ${fmt(board.height)}`);
  for (const path of paths) probe.appendChild(path.cloneNode(true));
  return insideArtboard(probe);
}

const noFit = (): BadgeResult => ({ ok: false, code: "no-fit", detail: "the corner badge has no measurable room inside the artboard" });
const unsupported = (detail: string): BadgeResult => ({ ok: false, code: "unsupported", detail });
