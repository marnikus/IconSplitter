// Conservative paint-order/backdrop analysis. Unknown overlap never becomes white.
import { shapeOutline } from "./geom/outline";
import { visibleBounds, type Bounds } from "./geom/bounds";
import { identity, type Matrix } from "./geom/matrix";
import { Unsupported, type Paint, type Rgb } from "./epspaint";

export interface PaintMark { bounds: Bounds; uniform: Rgb | null }

export function geometryBounds(el: Element, ctm: Matrix = identity(), stroke = 0): Bounds {
  const root = el.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
  const copy = el.cloneNode(false) as Element;
  copy.removeAttribute("style");
  copy.setAttribute("fill", "black");
  copy.setAttribute("stroke", stroke > 0 ? "black" : "none");
  copy.setAttribute("stroke-width", String(stroke));
  copy.setAttribute("stroke-miterlimit", "1000");
  copy.setAttribute("transform", `matrix(${Object.values(ctm).join(" ")})`);
  root.appendChild(copy);
  const bounds = visibleBounds(root)?.bounds;
  if (bounds === undefined || !Object.values(bounds).every(Number.isFinite)) throw new Unsupported("cannot establish gradient geometry bounds");
  return bounds;
}

export function uniformBackdrop(bounds: Bounds, marks: PaintMark[], fallback: Rgb): Rgb {
  for (let i = marks.length - 1; i >= 0; i--) {
    const mark = marks[i];
    if (!overlaps(mark.bounds, bounds)) continue;
    if (mark.uniform !== null && contains(mark.bounds, bounds)) return mark.uniform;
    throw new Unsupported("transparent gradient overlaps a nonuniform backdrop; vector compositing is unsupported");
  }
  return fallback;
}

export function recordPaint(el: Element, ctm: Matrix, paint: Paint, marks: PaintMark[]): void {
  const stroke = paint.stroke === null ? 0 : paint.strokeWidth;
  const bounds = geometryBounds(el, ctm, stroke);
  const uniform = isUniformRect(el, ctm, paint) ? paint.fill as Rgb : null;
  marks.push({ bounds, uniform });
}

function isUniformRect(el: Element, m: Matrix, p: Paint): boolean {
  const rect = rectangularFill(el);
  const solid = p.fill !== null && !("ref" in p.fill) && p.fillOpacity === 1;
  return rect && solid && p.stroke === null && m.b === 0 && m.c === 0;
}

function overlaps(a: Bounds, b: Bounds): boolean {
  return a.minX < b.minX + b.width && b.minX < a.minX + a.width
    && a.minY < b.minY + b.height && b.minY < a.minY + a.height;
}

function contains(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.minX && a.minY <= b.minY
    && a.minX + a.width >= b.minX + b.width && a.minY + a.height >= b.minY + b.height;
}

/** Optimizers commonly turn the artboard rectangle into a four-edge path. */
function rectangularFill(el: Element): boolean {
  const ops = shapeOutline(el)?.ops ?? [];
  if (ops.length !== 5 || ops[0].op !== "M" || ops[4].op !== "Z") return false;
  const points = ops.slice(0, 4);
  if (points.some((op) => op.op === "Z" || op.op === "C")) return false;
  const xy = points as { x: number; y: number }[];
  const xs = new Set(xy.map((p) => p.x)), ys = new Set(xy.map((p) => p.y));
  if (xs.size !== 2 || ys.size !== 2 || new Set(xy.map((p) => `${p.x},${p.y}`)).size !== 4) return false;
  return xy.every((p, i) => p.x === xy[(i + 1) % 4].x || p.y === xy[(i + 1) % 4].y);
}
