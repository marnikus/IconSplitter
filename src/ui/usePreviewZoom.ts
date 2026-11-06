// usePreviewZoom.ts — Ctrl+Shift + scroll over an SVG preview zooms it
// (2026-11-06, lib/zoomview): one hook for the row previews and the edit mode's
// artboard. The listener is not passive, so that scroll neither scrolls nor
// zooms the page; a plain scroll is left alone.

import { useCallback, useEffect, useState, type RefObject } from "react";
import { NO_ZOOM, zoomAt, zoomTransform, type ZoomView } from "../lib/zoomview";

export interface PreviewZoom {
  view: ZoomView;
  /** The artwork's CSS transform (origin: the frame's top-left). */
  transform: string;
  reset: () => void;
}

export function usePreviewZoom(frame: RefObject<HTMLElement | null>): PreviewZoom {
  const [view, setView] = useState<ZoomView>(NO_ZOOM);
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
