// quickplace.ts — the quick-edit toolbar's one place for an element (2026-11-14).
// It sits INSIDE its own element and clear of every other element, so the
// pointer reaches it without crossing anything that has its own toolbar:
//   background → free background (not the banner, an icon cell or its caption);
//   banner → free banner (not its texts, its icon or the split block);
//   split block → free block (not the texts or icon on it);
//   icon → inside its cell, clear of its ×, 🗑 and ○ buttons;
//   text / banner icon → inside its own box.
// Positions come from the layout and the drawn elements, never the pointer.
import { freeSpot, type Size } from "../lib/svgBuilder/freespot";
import type { Rect } from "../lib/svgBuilder/types";
import { QUICK_SPECS, type QuickKind } from "./quickedit";
import type { BuilderApi } from "./useSvgBuilder";

export interface Anchor { x: number; y: number }
interface Ctx { kind: QuickKind; el: Element; b: BuilderApi; board: HTMLElement | null; wrap: HTMLElement; zoom: number; origin: DOMRect }

const LIVE_SELECTOR: Partial<Record<QuickKind, string>> = {
  title: '[data-banner-text="title"]', subtitle: '[data-banner-text="subtitle"]', hero: "[data-banner-hero]", block: "[data-split-block]",
};

/** The toolbar's size: a 20 px dot, then 26 px buttons, 6 px gaps, padding and border. */
export function toolbarSize(kind: QuickKind): Size {
  const s = QUICK_SPECS[kind];
  const buttons = (s.stroke ? 1 : 0) + (s.text ? 1 : 0) + (kind === "title" || kind === "subtitle" ? 1 : 0) + (kind === "hero" ? 2 : 0);
  return { width: 12 + 20 + buttons * 32, height: 38 };
}

const scaled = (r: Rect, z: number): Rect => ({ x: r.x * z, y: r.y * z, width: r.width * z, height: r.height * z });

function rectOn(el: Element | null | undefined, origin: DOMRect): Rect | null {
  if (el === null || el === undefined) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left - origin.left, y: r.top - origin.top, width: r.width, height: r.height };
}

function shadowRect(ctx: Ctx, selector: string): Rect | null {
  return rectOn(ctx.board?.querySelector(".bld-artboard-svg")?.shadowRoot?.querySelector(selector), ctx.origin);
}

/** The element as the sheet shows it now: a redraw replaces the shadow SVG, so it is looked up again. */
function liveRect(ctx: Ctx): Rect | null {
  if (ctx.el.isConnected) return rectOn(ctx.el, ctx.origin);
  const selector = LIVE_SELECTOR[ctx.kind];
  return selector === undefined ? null : shadowRect(ctx, selector);
}

/** Every icon cell with its caption, on the wrap. */
function cellRects(ctx: Ctx): Rect[] {
  return ctx.b.layout.cells.map((c) => scaled({ x: c.x, y: c.y, width: c.size, height: Math.max(c.size, c.captionY + c.captionSize - c.y) }, ctx.zoom));
}

function areaOf(ctx: Ctx): Rect | null {
  const { width, height } = ctx.b.config.artboard;
  if (ctx.kind === "canvas") return scaled({ x: 0, y: 0, width, height }, ctx.zoom);
  if (ctx.kind === "banner") return ctx.b.layout.banner === null ? null : scaled(ctx.b.layout.banner, ctx.zoom);
  return liveRect(ctx);
}

function obstaclesOf(ctx: Ctx): Rect[] {
  const texts = ['[data-banner-text="title"]', '[data-banner-text="subtitle"]', "[data-banner-hero]"].map((s) => shadowRect(ctx, s));
  if (ctx.kind === "canvas") return [...(ctx.b.layout.banner === null ? [] : [scaled(ctx.b.layout.banner, ctx.zoom)]), ...cellRects(ctx)];
  if (ctx.kind === "banner") return [...texts, shadowRect(ctx, "[data-split-block]")].filter((r): r is Rect => r !== null);
  if (ctx.kind === "block") return texts.filter((r): r is Rect => r !== null);
  if (ctx.kind === "icon") return [...ctx.el.querySelectorAll(".bld-cell-lock, .bld-cell-exclude, .bld-cell-decline")].map((e) => rectOn(e, ctx.origin)).filter((r): r is Rect => r !== null);
  return [];
}

export function anchorOf(hover: { kind: QuickKind; el: Element }, b: BuilderApi, nodes: { board: HTMLElement | null; wrap: HTMLElement }): Anchor | null {
  const origin = nodes.wrap.getBoundingClientRect();
  const zoom = origin.width > 0 ? origin.width / b.config.artboard.width : 1;
  const ctx: Ctx = { ...hover, b, ...nodes, zoom, origin };
  const area = areaOf(ctx);
  if (area === null) return null;
  const spot = freeSpot(area, toolbarSize(hover.kind), obstaclesOf(ctx), { inset: hover.kind === "icon" ? 2 : 6 });
  // Too small for the toolbar: it stays on the element's own top edge (below an icon's buttons), still reachable directly.
  return spot ?? { x: area.x, y: area.y + (hover.kind === "icon" ? 12 : 0) };
}
