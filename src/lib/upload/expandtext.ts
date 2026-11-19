// expandtext.ts — "Expand text to fills" (2026-11-17), both flows: every
// <text> run becomes ONE filled <path> of glyph outlines placed by its own
// anchor. The outlines come from an injected outliner — a test fake, or the
// browser provider (textoutline.ts: Local Font Access + opentype.js). Every
// refusal is named BEFORE the tree is touched (RULE 4/15): a stroked text,
// tspan children, no outliner at all, or no outlines for a run's font.
import { browserTextOutliner } from "./textoutline";

export interface TextRun {
  value: string;
  x: number;
  y: number;
  size: number;
  weight: number;
  /** The run's font-family stack, verbatim — the outliner resolves it. */
  family: string;
  anchor: "start" | "middle" | "end";
  letterSpacing: number;
  fill: string;
  fillOpacity: string | null;
  opacity: string | null;
}

/** Glyph paths in run-local coordinates (baseline at 0,0, start anchor) plus the run's advance width. */
export interface TextOutline { d: string; width: number }
export type TextOutliner = (run: TextRun) => TextOutline | null;
export type ExpandTextResult = { ok: true; svg: string; runs: number } | { ok: false; svg: string; reason: string };

const SVG_NS = "http://www.w3.org/2000/svg";
let injected: TextOutliner | null = null;

export function setTextOutliner(next: TextOutliner | null): void { injected = next; }

/** The injected outliner, else whatever this machine can really outline with. */
export function textOutliner(): TextOutliner | null {
  return injected ?? browserTextOutliner();
}

const num = (value: string | null, fallback: number): number => {
  const n = value === null ? NaN : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * `letter-spacing` as PX per glyph (2026-11-19). The sheet writes px, but a
 * third-party document may write `0.1em`, `2px` or a bare number — every form
 * is resolved here against the run's own font size, so the outlines get the
 * spacing the file asked for instead of a silent 0.
 */
export function letterSpacingPx(raw: string | null, size: number): number {
  const text = (raw ?? "").trim();
  if (text === "" || text.toLowerCase() === "normal") return 0;
  const n = Number.parseFloat(text);
  if (!Number.isFinite(n)) return 0;
  if (/em$/i.test(text)) return n * size;
  return n; // px (the app's own form) and unitless numbers are already px
}

function runOf(el: Element): TextRun {
  const anchor = el.getAttribute("text-anchor");
  return {
    value: el.textContent ?? "",
    x: num(el.getAttribute("x"), 0),
    y: num(el.getAttribute("y"), 0),
    size: num(el.getAttribute("font-size"), 16),
    weight: num(el.getAttribute("font-weight"), 400),
    family: el.getAttribute("font-family") ?? "",
    anchor: anchor === "middle" || anchor === "end" ? anchor : "start",
    letterSpacing: letterSpacingPx(el.getAttribute("letter-spacing"), num(el.getAttribute("font-size"), 16)),
    fill: el.getAttribute("fill") ?? "#000000",
    fillOpacity: el.getAttribute("fill-opacity"),
    opacity: el.getAttribute("opacity"),
  };
}

function refusalOf(el: Element): string | null {
  const stroke = el.getAttribute("stroke");
  if (stroke !== null && stroke.trim().toLowerCase() !== "none") return "a stroked <text> cannot be expanded to fills — remove its stroke first";
  if (el.children.length > 0) return "a <text> with <tspan> children cannot be expanded to fills — one run per text element";
  return null;
}

const fmt = (n: number): string => String(Number(n.toFixed(2)));

interface Job { el: Element; run: TextRun; outline: TextOutline }

/** Every run's outline, or the first refusal — collected BEFORE any node moves. */
function collectJobs(texts: Element[], outliner: TextOutliner): { jobs: Job[] } | { reason: string } {
  const jobs: Job[] = [];
  for (const el of texts) {
    const refused = refusalOf(el);
    if (refused !== null) return { reason: refused };
    const run = runOf(el);
    const outline = outliner(run);
    if (outline === null) return { reason: `the outliner has no outlines for "${run.family || "the document font"}"` };
    jobs.push({ el, run, outline });
  }
  return { jobs };
}

/** One filled <path> per run, placed by its anchor, in the text's own spot. */
function replaceRuns(root: Element, jobs: Job[]): void {
  for (const { el, run, outline } of jobs) {
    const shift = run.anchor === "middle" ? outline.width / 2 : run.anchor === "end" ? outline.width : 0;
    const path = root.ownerDocument.createElementNS(SVG_NS, "path");
    path.setAttribute("d", outline.d);
    path.setAttribute("fill", run.fill);
    if (run.fillOpacity !== null) path.setAttribute("fill-opacity", run.fillOpacity);
    if (run.opacity !== null) path.setAttribute("opacity", run.opacity);
    path.setAttribute("transform", `translate(${fmt(run.x - shift)} ${fmt(run.y)})`);
    el.parentNode?.insertBefore(path, el);
    el.parentNode?.removeChild(el);
  }
}

/**
 * `deps.outliner` overrides the ambient outliner for ONE call (2026-11-19): the
 * builder's EPS stage outlines into a throw-away copy and must never change what
 * the rest of the app's exports use, and a caller with none says so with `null`.
 */
export interface ExpandTextDeps { outliner: TextOutliner | null }

export function expandTextToFills(svg: string, deps?: ExpandTextDeps): ExpandTextResult {
  const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  const texts = Array.from(root.getElementsByTagName("text"));
  if (texts.length === 0) return { ok: true, svg, runs: 0 };
  const outliner = deps === undefined ? textOutliner() : deps.outliner;
  if (outliner === null) return { ok: false, svg, reason: "no text outliner is available on this machine — the fonts of this document cannot be outlined here" };
  const collected = collectJobs(texts, outliner);
  if ("reason" in collected) return { ok: false, svg, reason: collected.reason };
  replaceRuns(root, collected.jobs);
  return { ok: true, svg: new XMLSerializer().serializeToString(root), runs: collected.jobs.length };
}
