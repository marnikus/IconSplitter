// useStageNavigation.ts — Figma-style navigation on the builder stage
// (2026-11-24): Ctrl/⌘ + wheel zooms around the cursor, Ctrl + Shift + wheel
// steps through round percentages (10 · 25 · 50 · 75 · 100 · 150 · 200 …), and
// holding the middle mouse button drags the canvas. Listeners are native: a
// React wheel handler is passive and could not stop the browser's page zoom.
import { useEffect, useLayoutEffect, useRef } from "react";
import { anchoredScroll, smoothZoom, snapZoom, wheelDelta } from "../lib/svgBuilder/stagezoom";

/** The artboard point (px) that was under the cursor (screen px) when the zoom changed. */
interface Anchor { x: number; y: number; px: number; py: number }
interface Live { zoom: number; setZoom: (zoom: number) => void }

/** Wheel travel a Shift-zoom collects before it takes one step (one mouse notch = 100). */
const SNAP_TRAVEL = 50;
const WRAP = ".bld-artboard-wrap";

export function useStageNavigation(box: { current: HTMLElement | null }, zoom: number, setZoom: (zoom: number) => void): void {
  const live = useRef<Live>({ zoom, setZoom });
  live.current = { zoom, setZoom };
  const anchor = useRef<Anchor | null>(null);
  useEffect(() => {
    const node = box.current;
    return node === null ? undefined : bindWheel(node, live, anchor);
  }, [box]);
  useEffect(() => {
    const node = box.current;
    return node === null ? undefined : bindMiddlePan(node);
  }, [box]);
  useLayoutEffect(() => {
    const a = anchor.current;
    anchor.current = null;
    if (a !== null && box.current !== null) keepUnderCursor(box.current, a, zoom);
  }, [box, zoom]);
}

function bindWheel(node: HTMLElement, live: { current: Live }, anchor: { current: Anchor | null }): () => void {
  let travel = 0;
  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return; // a plain wheel still scrolls
    e.preventDefault();
    const delta = wheelDelta(e);
    const { zoom, setZoom } = live.current;
    travel = e.shiftKey ? travel + delta : 0;
    if (e.shiftKey && Math.abs(travel) < SNAP_TRAVEL) return;
    const next = e.shiftKey ? snapZoom(zoom, travel) : smoothZoom(zoom, delta);
    travel = 0;
    if (next === zoom) return;
    anchor.current = anchorOf(node, e, zoom);
    setZoom(next);
  };
  node.addEventListener("wheel", onWheel, { passive: false });
  return () => node.removeEventListener("wheel", onWheel);
}

function anchorOf(node: HTMLElement, e: WheelEvent, zoom: number): Anchor | null {
  const wrap = node.querySelector(WRAP);
  if (wrap === null || zoom <= 0) return null;
  const r = wrap.getBoundingClientRect();
  return { x: e.clientX, y: e.clientY, px: (e.clientX - r.left) / zoom, py: (e.clientY - r.top) / zoom };
}

function keepUnderCursor(node: HTMLElement, a: Anchor, zoom: number): void {
  const wrap = node.querySelector(WRAP);
  if (wrap === null) return;
  const r = wrap.getBoundingClientRect();
  node.scrollLeft = anchoredScroll({ scroll: node.scrollLeft, cursor: a.x, edge: r.left, point: a.px, zoom });
  node.scrollTop = anchoredScroll({ scroll: node.scrollTop, cursor: a.y, edge: r.top, point: a.py, zoom });
}

/** Middle button held = hand tool: captured before any grip, so it never starts a resize. */
function bindMiddlePan(node: HTMLElement): () => void {
  const block = (e: MouseEvent) => { if (e.button === 1) e.preventDefault(); }; // no Windows autoscroll
  const onDown = (e: PointerEvent) => {
    if (e.button !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    startPan(node, e);
  };
  node.addEventListener("pointerdown", onDown, { capture: true });
  node.addEventListener("mousedown", block, { capture: true });
  node.addEventListener("auxclick", block);
  return () => {
    node.removeEventListener("pointerdown", onDown, { capture: true });
    node.removeEventListener("mousedown", block, { capture: true });
    node.removeEventListener("auxclick", block);
  };
}

function startPan(node: HTMLElement, e: PointerEvent): void {
  const from = { x: e.clientX, y: e.clientY, left: node.scrollLeft, top: node.scrollTop };
  node.classList.add("is-panning");
  const onMove = (ev: PointerEvent) => {
    node.scrollLeft = from.left - (ev.clientX - from.x);
    node.scrollTop = from.top - (ev.clientY - from.y);
  };
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    node.classList.remove("is-panning");
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}
