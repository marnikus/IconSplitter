// usePreviewZoom.ts — Ctrl+Shift + scroll over an SVG preview zooms it, and a
// middle-button drag moves it (2026-11-06, lib/zoomview): one hook for the row
// previews and the edit mode's artboard. The wheel listener is not passive, so
// that scroll neither scrolls nor zooms the page (a plain scroll is left
// alone); the middle button never starts the browser's auto-scroll there.

import { useCallback, useEffect, useState, type RefObject } from "react";
import { NO_ZOOM, panBy, zoomAt, zoomTransform, type ZoomView } from "../lib/zoomview";

export interface PreviewZoom {
  view: ZoomView;
  /** The artwork's CSS transform (origin: the frame's top-left). */
  transform: string;
  reset: () => void;
}

type SetView = (fn: (v: ZoomView) => ZoomView) => void;

/** Middle button held: the artwork follows the pointer until it is released. */
function usePan(frame: RefObject<HTMLElement | null>, setView: SetView): void {
  useEffect(() => {
    const node = frame.current;
    if (node === null) return undefined;
    let last: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.button !== 1) return;
      e.preventDefault(); // no auto-scroll
      e.stopPropagation();
      last = { x: e.clientX, y: e.clientY };
      node.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (last === null) return;
      const from = last;
      last = { x: e.clientX, y: e.clientY };
      setView((v) => panBy(v, e.clientX - from.x, e.clientY - from.y));
    };
    const up = () => { last = null; };
    const noAuto = (e: MouseEvent) => { if (e.button === 1) e.preventDefault(); };
    const on: [string, (e: never) => void][] = [["pointerdown", down], ["pointermove", move], ["pointerup", up], ["pointercancel", up], ["mousedown", noAuto], ["auxclick", noAuto]];
    for (const [t, fn] of on) node.addEventListener(t, fn as EventListener);
    return () => { for (const [t, fn] of on) node.removeEventListener(t, fn as EventListener); };
  }, [frame, setView]);
}

export function usePreviewZoom(frame: RefObject<HTMLElement | null>): PreviewZoom {
  const [view, setView] = useState<ZoomView>(NO_ZOOM);
  usePan(frame, setView);
  useEffect(() => {
    const node = frame.current;
    if (node === null) return undefined;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      const r = node.getBoundingClientRect();
      // Shift turns a vertical wheel into a horizontal one in some browsers
      const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
      setView((v) => zoomAt(v, { x: e.clientX - r.left, y: e.clientY - r.top }, delta));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [frame]);
  const reset = useCallback(() => setView(NO_ZOOM), []);
  return { view, transform: zoomTransform(view), reset };
}
