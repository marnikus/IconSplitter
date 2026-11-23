// svgdirect.ts — absorbs SVG `transform` wrappers into direct coordinates/sizes
// and rounds geometry, `viewBox`, sizes and `stroke-*` values to at most 1
// decimal place with trailing `.0` stripped (RULE 26). CSS `em` tracking and
// `0..1` alpha/gradient-stop ratios are left untouched.
import { bakeGeometry } from "./bake";
import { identity, parseTransform } from "./geom/matrix";
import { directPathData, fmt1, round1 } from "./svgdirectpath";

export { directPathData, fmt1, round1 };

export interface DirectBakeOptions {
  scale?: number;
  dx?: number;
  dy?: number;
  scaleStrokes?: boolean;
}

interface WalkState {
  s: number;
  dx: number;
  dy: number;
  scaleStrokes: boolean;
  rootSw: number | null;
}

type LocalTransform =
  | { kind: "uniform"; s: number; dx: number; dy: number }
  | { kind: "general" };

const PX_NUM = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*(?:px)?\s*$/i;
const SKIP_TAGS = new Set(["metadata", "title", "desc", "style"]);

function parseNumAttr(raw: string | null): number | null {
  if (raw === null) return null;
  const m = PX_NUM.exec(raw);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function classifyTransform(raw: string | null): LocalTransform {
  if (!raw || !raw.trim()) return { kind: "uniform", s: 1, dx: 0, dy: 0 };
  const { a, b, c, d, e, f } = parseTransform(raw);
  const ortho = Math.abs(b) <= 1e-6 && Math.abs(c) <= 1e-6;
  if (ortho && a > 1e-6 && Math.abs(a - d) <= 1e-6) {
    return { kind: "uniform", s: a, dx: e, dy: f };
  }
  return { kind: "general" };
}

function scaleAttr(el: Element, name: string, s: number, offset = 0): void {
  const n = parseNumAttr(el.getAttribute(name));
  if (n === null) return;
  el.setAttribute(name, fmt1(offset + s * n));
}

function scalePosAttr(el: Element, name: string, s: number): void {
  const n = parseNumAttr(el.getAttribute(name));
  if (n === null) return;
  el.setAttribute(name, fmt1(s * n, 0.1));
}

function setCoordOrZero(el: Element, name: string, s: number, offset: number): void {
  const n = parseNumAttr(el.getAttribute(name));
  if (n === null && Math.abs(offset) <= 1e-9) return;
  el.setAttribute(name, fmt1(offset + s * (n ?? 0)));
}

function bakePoints(el: Element, st: WalkState): void {
  const raw = el.getAttribute("points");
  if (!raw) return;
  const nums = (raw.trim().match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
  const pairs: string[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pairs.push(`${fmt1(st.dx + st.s * nums[i])},${fmt1(st.dy + st.s * nums[i + 1])}`);
  }
  el.setAttribute("points", pairs.join(" "));
}

function bakeText(el: Element, st: WalkState, isRootText: boolean): void {
  if (isRootText) {
    setCoordOrZero(el, "x", st.s, st.dx);
    setCoordOrZero(el, "y", st.s, st.dy);
  } else {
    scaleAttr(el, "x", st.s, st.dx);
    scaleAttr(el, "y", st.s, st.dy);
  }
  scaleAttr(el, "dx", st.s);
  scaleAttr(el, "dy", st.s);
  scalePosAttr(el, "font-size", st.s);
}

function bakeRadius(el: Element, name: string, s: number): void {
  const r = parseNumAttr(el.getAttribute(name));
  if (r !== null) el.setAttribute(name, r > 0 ? fmt1(s * r, 0.1) : "0");
}

function bakePath(el: Element, st: WalkState): void {
  const d = el.getAttribute("d");
  if (d !== null) el.setAttribute("d", directPathData(d, { scale: st.s, dx: st.dx, dy: st.dy }));
}

function bakeRect(el: Element, st: WalkState): void {
  setCoordOrZero(el, "x", st.s, st.dx);
  setCoordOrZero(el, "y", st.s, st.dy);
  for (const attr of ["width", "height", "rx", "ry"]) scaleAttr(el, attr, st.s);
}

function bakeRound(el: Element, st: WalkState): void {
  setCoordOrZero(el, "cx", st.s, st.dx);
  setCoordOrZero(el, "cy", st.s, st.dy);
  if (el.localName === "circle") bakeRadius(el, "r", st.s);
  else { bakeRadius(el, "rx", st.s); bakeRadius(el, "ry", st.s); }
}

function bakeLine(el: Element, st: WalkState): void {
  setCoordOrZero(el, "x1", st.s, st.dx);
  setCoordOrZero(el, "y1", st.s, st.dy);
  setCoordOrZero(el, "x2", st.s, st.dx);
  setCoordOrZero(el, "y2", st.s, st.dy);
}

function bakeUse(el: Element, st: WalkState): void {
  scaleAttr(el, "x", st.s, st.dx);
  scaleAttr(el, "y", st.s, st.dy);
  scaleAttr(el, "width", st.s);
  scaleAttr(el, "height", st.s);
}

const SHAPE_BAKERS: Record<string, (el: Element, st: WalkState) => void> = {
  path: bakePath, rect: bakeRect, circle: bakeRound, ellipse: bakeRound,
  line: bakeLine, polyline: bakePoints, polygon: bakePoints, use: bakeUse,
};

function bakeStyleStroke(el: Element, strokeScale: number): void {
  const style = el.getAttribute("style");
  if (!style || !style.includes("stroke-width")) return;
  const next = style.replace(
    /(^|;)\s*stroke-width\s*:\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*(px)?/gi,
    (_m, lead: string, num: string, unit?: string) => `${lead}stroke-width:${fmt1(Number(num) * strokeScale, 0.1)}${unit ?? ""}`,
  );
  el.setAttribute("style", next);
}

function bakeDasharray(el: Element, ss: number): void {
  const dash = el.getAttribute("stroke-dasharray");
  if (!dash || dash.trim() === "none") return;
  const parts = dash.trim().split(/[\s,]+/).map((p) => {
    const n = parseNumAttr(p);
    return n === null ? p : fmt1(n * ss, n > 0 ? 0.1 : 0);
  });
  el.setAttribute("stroke-dasharray", parts.join(" "));
}

function bakeStrokes(el: Element, st: WalkState, localS: number): number | null {
  const ss = st.scaleStrokes ? st.s : 1;
  const ownSw = parseNumAttr(el.getAttribute("stroke-width"));
  const factor = st.scaleStrokes ? localS : 1;
  let nextRootSw = st.rootSw === null ? null : st.rootSw * factor;
  if (ownSw !== null) {
    const baked = ownSw * ss;
    el.setAttribute("stroke-width", ownSw > 0 ? fmt1(baked, 0.1) : "0");
    nextRootSw = baked;
  } else if (st.scaleStrokes && Math.abs(localS - 1) > 1e-6 && nextRootSw !== null) {
    el.setAttribute("stroke-width", fmt1(nextRootSw, 0.1));
  }
  bakeDasharray(el, ss);
  scaleAttr(el, "stroke-dashoffset", ss);
  scaleAttr(el, "stroke-miterlimit", 1);
  bakeStyleStroke(el, ss);
  return nextRootSw;
}

function bakeUserSpaceDef(el: Element, st: WalkState): void {
  if (el.getAttribute("gradientUnits") !== "userSpaceOnUse") return;
  for (const xAttr of ["x1", "x2", "cx", "fx"]) scaleAttr(el, xAttr, st.s, st.dx);
  for (const yAttr of ["y1", "y2", "cy", "fy"]) scaleAttr(el, yAttr, st.s, st.dy);
  scalePosAttr(el, "r", st.s);
}

function bakeDefs(defs: Element, st: WalkState): void {
  for (const child of Array.from(defs.children)) {
    const tag = child.localName;
    if (tag === "linearGradient" || tag === "radialGradient") bakeUserSpaceDef(child, st);
    else if (tag === "clipPath" && child.getAttribute("clipPathUnits") !== "objectBoundingBox") {
      for (const c of Array.from(child.children)) walkElement(c, st);
    } else if (tag !== "pattern" && tag !== "mask") {
      walkElement(child, { ...st, dx: 0, dy: 0 });
    }
  }
}

function advanceState(el: Element, parent: WalkState): [WalkState, number] {
  let local = classifyTransform(el.getAttribute("transform"));
  if (local.kind === "general" && el.localName !== "text" && el.querySelector("text") === null) {
    bakeGeometry(el, identity());
    local = { kind: "uniform", s: 1, dx: 0, dy: 0 };
  }
  if (local.kind !== "uniform") return [{ ...parent }, 1];
  el.removeAttribute("transform");
  const st: WalkState = {
    s: parent.s * local.s,
    dx: parent.dx + parent.s * local.dx,
    dy: parent.dy + parent.s * local.dy,
    scaleStrokes: parent.scaleStrokes,
    rootSw: parent.rootSw,
  };
  return [st, local.s];
}

function walkElement(el: Element, parent: WalkState): void {
  const tag = el.localName;
  if (SKIP_TAGS.has(tag)) return;
  const [st, ls] = advanceState(el, parent);
  st.rootSw = bakeStrokes(el, st, ls);
  if (tag === "defs") { bakeDefs(el, st); return; }
  if (tag === "text" || tag === "tspan") bakeText(el, st, tag === "text");
  else SHAPE_BAKERS[tag]?.(el, st);
  for (const child of Array.from(el.children)) walkElement(child, st);
}

/** Rounds root `viewBox` and numeric `width`/`height` to at most 1 decimal place. */
export function roundRootFrame1(root: Element): void {
  const vb = root.getAttribute("viewBox");
  if (vb) {
    const p = vb.trim().split(/[\s,]+/).map(Number);
    if (p.length === 4 && p.every(Number.isFinite)) {
      root.setAttribute("viewBox", `${fmt1(p[0])} ${fmt1(p[1])} ${fmt1(p[2], 0.1)} ${fmt1(p[3], 0.1)}`);
    }
  }
  scalePosAttr(root, "width", 1);
  scalePosAttr(root, "height", 1);
}

/** Absorbs transforms into direct geometry and rounds SVG coordinates/sizes/strokes to ≤ 1 decimal place. */
export function bakeDirectSvg(root: Element, opts?: DirectBakeOptions): void {
  const initial: WalkState = {
    s: opts?.scale ?? 1,
    dx: opts?.dx ?? 0,
    dy: opts?.dy ?? 0,
    scaleStrokes: opts?.scaleStrokes ?? true,
    rootSw: null,
  };
  walkElement(root, initial);
  roundRootFrame1(root);
}
