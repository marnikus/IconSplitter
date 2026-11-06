// LazyPreview.tsx — lazy row previews for every list tab (2026-11-06). A row is
// always rendered (its name, status, buttons); only its PREVIEW waits: the first
// EAGER_ROWS rows mount theirs at once, every later row shows an empty box of
// the same size until it comes within EDGE_ROWS rows of the visible area, then
// mounts its preview and KEEPS it (scrolling back never reloads or flickers).
// Nothing inside a waiting preview runs, so no file is read or decoded for it.
//
// Performance: ONE IntersectionObserver per scroll area (and look-ahead)
// watches every placeholder of that list, on the list's real scroll container
// (watching the window would let that container clip the look-ahead away).
// The look-ahead is generous so a quick scroll finds previews already there.
// Off (ui/lazypreviews), outside a list, or without IntersectionObserver:
// everything loads at once.

import { createContext, useContext, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useLazyPreviews } from "./lazypreviews";

/** Rows whose preview loads at once, whatever is visible. */
export const EAGER_ROWS = 20;
/** How many rows beyond the visible edges load ahead. */
export const EDGE_ROWS = 15;
/** Space a row adds around its preview (padding, text lines). */
const ROW_GAP = 24;

const RowIndex = createContext<number | null>(null);

/** Gives every row element its position, so its preview knows if it is among the first rows. */
export function withRowIndexes(rows: readonly ReactElement[]): ReactElement[] {
  return rows.map((row, index) => <RowIndex.Provider key={row.key ?? index} value={index}>{row}</RowIndex.Provider>);
}

interface Watch { root: Element | null; observer: IntersectionObserver; waiting: Map<Element, () => void> }

/** Shared observers: one per (scroll root, look-ahead). */
const watches = new Map<Element | null, Map<number, Watch>>();

function watchOf(root: Element | null, margin: number): Watch {
  const byMargin = watches.get(root) ?? new Map<number, Watch>();
  watches.set(root, byMargin);
  const hit = byMargin.get(margin);
  if (hit) return hit;
  const waiting = new Map<Element, () => void>();
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const ready = entry.isIntersecting ? waiting.get(entry.target) : undefined;
      if (ready === undefined) continue;
      waiting.delete(entry.target);
      observer.unobserve(entry.target);
      ready();
    }
    if (waiting.size === 0) release(root, margin);
  }, { root, rootMargin: `${margin}px 0px ${margin}px 0px` });
  const watch = { root, observer, waiting };
  byMargin.set(margin, watch);
  return watch;
}

/** An observer with nothing left to wait for lets go of its scroll area. */
function release(root: Element | null, margin: number): void {
  const byMargin = watches.get(root);
  byMargin?.get(margin)?.observer.disconnect();
  byMargin?.delete(margin);
  if (byMargin?.size === 0) watches.delete(root);
}

/**
 * The ancestor that REALLY scrolls vertically: overflow-y auto/scroll AND taller
 * content than its box. `overflow-y` alone is not enough — a list table with
 * only `overflow-x: auto` computes `overflow-y: auto` too, yet is as tall as all
 * its rows; watched there, every row counts as visible and every preview loads
 * (the 2026-11-06 bug). Nothing measurable yet (a hidden tab has no layout):
 * the app's scrolling area, never the window — whose clipping would cut the
 * look-ahead away.
 */
function scrollRootOf(el: Element): Element | null {
  for (let p = el.parentElement; p !== null; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return el.closest(".app-main");
}

/** Calls `ready` once when `el` comes within EDGE_ROWS rows; returns the cleanup. */
function whenNear(el: Element, rowSize: number, ready: () => void): () => void {
  if (typeof IntersectionObserver !== "function") { ready(); return () => undefined; }
  const margin = Math.ceil((EDGE_ROWS * (rowSize + ROW_GAP)) / 250) * 250; // shared in 250 px steps
  const watch = watchOf(scrollRootOf(el), margin);
  watch.waiting.set(el, ready);
  watch.observer.observe(el);
  return () => {
    watch.waiting.delete(el);
    watch.observer.unobserve(el);
    if (watch.waiting.size === 0) release(watch.root, margin);
  };
}

export interface LazyPreviewProps {
  /** The preview's height in px (its row's zoom height) — also the waiting box's. */
  size: number;
  /** The waiting box's width; the height by default (a square thumbnail). */
  width?: number;
  children: ReactNode;
}

export default function LazyPreview({ size, width, children }: LazyPreviewProps) {
  const on = useLazyPreviews();
  const index = useContext(RowIndex);
  const eager = !on || index === null || index < EAGER_ROWS;
  const [near, setNear] = useState(false);
  const box = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (eager || near || box.current === null) return undefined;
    return whenNear(box.current, size, () => setNear(true));
  }, [eager, near, size]);
  if (eager || near) return <>{children}</>;
  return <span ref={box} className="lazy-preview" aria-hidden="true" style={{ width: width ?? size, height: size }} />;
}
