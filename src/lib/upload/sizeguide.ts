// sizeguide.ts — the S/L size guide: the finished icon repeated at two smaller
// sizes in one artboard corner, each with its supplied S/L label underneath
// (2026-10-20, archive/2026-10-20-upload-size-guide). Pure layout + vector
// composition: the repeats are baked into artboard px, strokes are verbatim px,
// the guide never changes the icon fit, and a placement with no room fails by name.
import { fmt } from "./geom";
import { visibleBounds, type Bounds } from "./geom/bounds";
import { SIZE_GUIDE_STROKE_MAX, SIZE_GUIDE_STROKE_MIN } from "./settingsnumbers";
import { buildCopy, defineCopyStroke, isolateIds, translateCopy } from "./sizeguidecopy";
import { labelAspect, labelPath, readLabels, type Labels } from "./sizeguidelabel";

const TOL = 0.002;
const FIT_TOL = 1e-6;
/** Fixed px strokes add a constant reach while geometry scales; two samples solve it, extra passes guard switches. */
const SHRINK_PASSES = 6;
const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"];
/**
 * The letters' shared height as a share of the SMALLER logo's width — one
 * legend size for both, as the reference artboard draws them — and the clear
 * gap under the logos.
 */
export const SIZE_GUIDE_LABEL_RATIO = 0.28;
export const SIZE_GUIDE_LABEL_GAP_RATIO = 0.1;

export type SizeGuideCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface SizeGuidePlacement {
  corner: SizeGuideCorner;
  offsetXPct: number;
  offsetYPct: number;
  /** S and L logo widths as percentages of the artboard WIDTH. */
  smallPct: number;
  largePct: number;
  /** Clear distance between the two logos, % of the artboard width. */
  gapPct: number;
}

export interface SizeGuideSource {
  /** The placed icon root (after the artboard fit; never modified). */
  icon: Element;
  /** Its shipped bounds in artboard px. */
  bounds: Bounds;
  /** Each repeat's own stroke width in final px (null or 0 = the icon's own, scaled by the bake). */
  strokePx: { small: number | null; large: number | null };
  expand: boolean;
  /** The repeats' stroke paint (null = the artwork's own). */
  color: string | null;
}

export interface SizeGuideCopyResult { group: Element; label: Element }
export interface SizeGuideBox { x: number; y: number; width: number; height: number }
export type SizeGuideFailure = { ok: false; code: "no-fit" | "unsupported"; detail: string };
export type SizeGuideResult =
  | { ok: true; bounds: SizeGuideBox; copies: SizeGuideCopyResult[]; expanded: number }
  | SizeGuideFailure;

interface Logo { width: number; icon: Bounds; label: Bounds }
interface Plan { logos: [Logo, Logo]; width: number; height: number }
interface Probe { scale: number; box: Bounds }
type Compose = { ok: true; copies: SizeGuideCopyResult[]; box: Bounds; expanded: number } | SizeGuideFailure;

/** Place the S/L guide in the chosen corner; on a refusal the export tree stays untouched. */
export function appendSizeGuide(
  root: Element, artboard: { width: number; height: number }, source: SizeGuideSource, placement: SizeGuidePlacement,
): SizeGuideResult {
  if (!validRequest(root, artboard, source, placement)) {
    return unsupported("invalid size guide artboard, bounds, stroke widths or percentages");
  }
  const labels = readLabels();
  if (labels === null) return unsupported("the bundled S/L size labels are malformed");
  const wanted = planOf(artboard, placement, source.bounds, labels);
  if (wanted === null) return noFit();
  const built = fittedBuild({ root, artboard, source, placement, labels }, wanted);
  if (built.ok === false) return built;
  if (!insideBox(built.box, artboard)) return noFit();
  for (const copy of built.copies) root.append(copy.group, copy.label);
  return { ok: true, bounds: boxOf(built.box), copies: built.copies, expanded: built.expanded };
}

/** One build request: everything the layout needs, so the shrink loop reads one name. */
interface BuildRequest {
  root: Element;
  artboard: { width: number; height: number };
  source: SizeGuideSource;
  placement: SizeGuidePlacement;
  labels: Labels;
}

/** The requested plan first; fixed px strokes add a constant reach, solved from two measurements. */
function fittedBuild(request: BuildRequest, wanted: Plan): Compose {
  const { root, source, labels, artboard, placement } = request;
  const avail = roomOf(artboard, placement);
  if (avail === null) return noFit();
  let scale = 1;
  let prev: Probe | null = null;
  for (let pass = 0; pass < SHRINK_PASSES; pass++) {
    const built = compose(root, source, labels, scale === 1 ? wanted : shrink(wanted, scale));
    if (built.ok === false) return built;
    if (built.box.width <= avail.width + FIT_TOL && built.box.height <= avail.height + FIT_TOL) {
      return placeParts(built, artboard, placement);
    }
    const next = nextScale(scale, built.box, prev, avail);
    if (!(next > 0) || !(next < scale)) return noFit();
    prev = { scale, box: built.box };
    scale = next;
  }
  return noFit();
}

/** Build every part at the guide's own origin, measure it, then translate it into its corner. */
function compose(root: Element, source: SizeGuideSource, labels: Labels, plan: Plan): Compose {
  const copies: SizeGuideCopyResult[] = [];
  let expanded = 0;
  for (const [index, logo] of plan.logos.entries()) {
    const copy = buildCopy(root, source.icon, {
      bounds: source.bounds, rect: logo.icon, expand: source.expand, color: source.color,
      strokeWidthPx: index === 0 ? source.strokePx.small : source.strokePx.large,
    });
    if (copy.ok === false) return unsupported(copy.detail);
    const label = labelPath(root, index === 0 ? labels.small : labels.large, logo.label);
    if (label === null) return unsupported("the bundled S/L size labels are malformed");
    copies.push({ group: copy.group, label });
    expanded += copy.expanded;
  }
  const box = unionOf(copies);
  return box === null ? noFit() : { ok: true, copies, box, expanded };
}

/** Anchor the measured group at the chosen edges, then give each part its own stroke definition. */
function placeParts(built: Extract<Compose, { ok: true }>, artboard: { width: number; height: number }, p: SizeGuidePlacement): Compose {
  const mx = artboard.width * p.offsetXPct / 100;
  const my = artboard.height * p.offsetYPct / 100;
  const x = p.corner.endsWith("left") ? mx : artboard.width - mx - built.box.width;
  const y = p.corner.startsWith("top") ? my : artboard.height - my - built.box.height;
  const dx = x - built.box.minX;
  const dy = y - built.box.minY;
  for (const copy of built.copies) {
    translateCopy(copy.group, dx, dy);
    translateCopy(copy.label, dx, dy);
    defineCopyStroke(copy.group);
  }
  const taken = idsOf(built.copies);
  for (const copy of built.copies) {
    isolateIds(copy.group, taken);
    isolateIds(copy.label, taken);
  }
  return { ...built, box: { minX: x, minY: y, width: built.box.width, height: built.box.height } };
}

/** Percentages of the artboard WIDTH lay out both logos, their labels and the gap. */
function planOf(artboard: { width: number; height: number }, p: SizeGuidePlacement, box: Bounds, labels: Labels): Plan | null {
  const unit = artboard.width;
  const widths = [unit * p.smallPct / 100, unit * p.largePct / 100] as const;
  const gap = unit * p.gapPct / 100;
  const aspect = box.height / box.width;
  const aspects = [labelAspect(labels.small), labelAspect(labels.large)];
  if (aspects.some((ratio) => ratio === null)) return null;
  // ONE legend size: S and L are the same letter size whatever the logos are
  // (the reference artboard draws both labels at one height, 2026-10-20).
  const labelHeight = SIZE_GUIDE_LABEL_RATIO * Math.min(widths[0], widths[1]);
  const icons = widths.map((width) => width * aspect);
  const labelGap = SIZE_GUIDE_LABEL_GAP_RATIO * Math.max(widths[0], widths[1]);
  const height = Math.max(icons[0], icons[1]) + labelGap + labelHeight;
  const logos = [0, 1].map((i) => logoAt({
    x: i === 0 ? 0 : widths[0] + gap, width: widths[i], iconHeight: icons[i],
    labelHeight, labelAspect: aspects[i] as number, iconBottom: Math.max(icons[0], icons[1]), bottom: height,
  })) as [Logo, Logo];
  return { logos, width: widths[0] + gap + widths[1], height };
}

interface LogoWant {
  x: number; width: number; iconHeight: number;
  labelHeight: number; labelAspect: number;
  /** The shared icon baseline and the label baseline (both from the guide's top). */
  iconBottom: number; bottom: number;
}

/** One logo's icon rect (on the shared baseline) and its centred label rect (on the label baseline). */
function logoAt(want: LogoWant): Logo {
  const labelWidth = want.labelHeight * want.labelAspect;
  return {
    width: want.width,
    icon: { minX: want.x, minY: want.iconBottom - want.iconHeight, width: want.width, height: want.iconHeight },
    label: { minX: want.x + want.width / 2 - labelWidth / 2, minY: want.bottom - want.labelHeight, width: labelWidth, height: want.labelHeight },
  };
}

export function noFit(): SizeGuideFailure {
  return { ok: false, code: "no-fit", detail: "the size guide has no measurable room inside the artboard" };
}

function unsupported(detail: string): SizeGuideFailure {
  return { ok: false, code: "unsupported", detail };
}

function validRequest(
  root: Element, artboard: { width: number; height: number }, source: SizeGuideSource, p: SizeGuidePlacement,
): boolean {
  return artboardValid(root, artboard) && sourceValid(source) && placementValid(p);
}

/** The root really carries the artboard the caller measured. */
function artboardValid(root: Element, artboard: { width: number; height: number }): boolean {
  const vb = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  return root.nodeName === "svg" && vb.length === 4 && vb[0] === 0 && vb[1] === 0
    && vb[2] === artboard.width && vb[3] === artboard.height
    && [artboard.width, artboard.height].every((n) => Number.isFinite(n) && n > 0);
}

function sourceValid(source: SizeGuideSource): boolean {
  const strokeOk = (n: number | null) => n === null || (Number.isFinite(n) && n >= SIZE_GUIDE_STROKE_MIN && n <= SIZE_GUIDE_STROKE_MAX);
  return source.bounds.width > 0 && source.bounds.height > 0 && strokeOk(source.strokePx.small) && strokeOk(source.strokePx.large);
}

/** Every percentage is finite and inside the range its clamp enforces. */
function placementValid(p: SizeGuidePlacement): boolean {
  const numbers = [p.offsetXPct, p.offsetYPct, p.smallPct, p.largePct, p.gapPct];
  return CORNERS.includes(p.corner) && numbers.every(Number.isFinite)
    && [p.offsetXPct, p.offsetYPct, p.gapPct].every((n) => n >= 0 && n <= 100)
    && [p.smallPct, p.largePct].every((n) => n > 0 && n <= 100);
}

function unionOf(copies: readonly SizeGuideCopyResult[]): Bounds | null {
  const boxes = copies.flatMap((copy) => [visibleBounds(copy.group)?.bounds, visibleBounds(copy.label)?.bounds])
    .filter((box): box is Bounds => box !== undefined);
  return boxes.length === 0 ? null : boxes.reduce((a, b) => unionBox(a, b));
}

function unionBox(a: Bounds, b: Bounds): Bounds {
  const minX = Math.min(a.minX, b.minX);
  const minY = Math.min(a.minY, b.minY);
  return {
    minX, minY,
    width: Math.max(a.minX + a.width, b.minX + b.width) - minX,
    height: Math.max(a.minY + a.height, b.minY + b.height) - minY,
  };
}

function boxOf(box: Bounds): SizeGuideBox {
  return { x: round(box.minX), y: round(box.minY), width: round(box.width), height: round(box.height) };
}

function round(n: number): number {
  return Number(fmt(n));
}

/** Available room inside the artboard after the chosen edge insets; null when none remains. */
function roomOf(artboard: { width: number; height: number }, p: SizeGuidePlacement): { width: number; height: number } | null {
  const width = artboard.width * (1 - p.offsetXPct / 100);
  const height = artboard.height * (1 - p.offsetYPct / 100);
  return width > 0 && height > 0 ? { width, height } : null;
}

/** Secant step on `size(k) = slope·k + strokeReach`: solves fixed px stroke reach in one pass after the first shrink. */
function nextScale(scale: number, box: Bounds, prev: Probe | null, avail: { width: number; height: number }): number {
  const sx = axisScale(scale, box.width, prev === null ? null : { scale: prev.scale, size: prev.box.width }, avail.width);
  const sy = axisScale(scale, box.height, prev === null ? null : { scale: prev.scale, size: prev.box.height }, avail.height);
  return Math.min(sx, sy);
}

function axisScale(scale: number, size: number, prev: { scale: number; size: number } | null, limit: number): number {
  if (size <= limit) return scale;
  if (prev === null || prev.scale === scale) return scale * (limit / size);
  const slope = (size - prev.size) / (scale - prev.scale);
  const reach = size - slope * scale;
  return slope > 0 && limit > reach ? (limit - reach) / slope : 0;
}

function shrink(plan: Plan, factor: number): Plan {
  const logos = plan.logos.map((logo) => ({
    width: logo.width * factor, icon: scaleBox(logo.icon, factor), label: scaleBox(logo.label, factor),
  })) as [Logo, Logo];
  return { logos, width: plan.width * factor, height: plan.height * factor };
}

function scaleBox(box: Bounds, factor: number): Bounds {
  return { minX: box.minX * factor, minY: box.minY * factor, width: box.width * factor, height: box.height * factor };
}

function insideBox(box: Bounds, artboard: { width: number; height: number }): boolean {
  return box.minX >= -TOL && box.minY >= -TOL
    && box.minX + box.width <= artboard.width + TOL && box.minY + box.height <= artboard.height + TOL;
}

/** Every id already in the export document: fresh copies must never repeat one. */
function idsOf(copies: readonly SizeGuideCopyResult[]): Set<string> {
  const ids = new Set<string>();
  for (const copy of copies) {
    const doc = copy.group.ownerDocument;
    for (const el of Array.from(doc.querySelectorAll("[id]"))) ids.add(el.getAttribute("id") ?? "");
  }
  return ids;
}
