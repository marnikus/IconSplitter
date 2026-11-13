// zoomview.ts — zooming an SVG preview inside its frame (2026-11-06): Ctrl
// + scroll, 10 %–400 %, toward the pointer (the content point under it stays
// put). The frame keeps its size; only the artwork is scaled and moved. Pure.

/** The artwork's scale and its offset inside the frame, in frame pixels. */
export interface ZoomView { scale: number; x: number; y: number }

export const ZOOM_VIEW_MIN = 0.1;
export const ZOOM_VIEW_MAX = 4;
/** One scroll notch: ×1.1 in, ÷1.1 out. */
export const ZOOM_VIEW_STEP = 1.1;
export const NO_ZOOM: ZoomView = { scale: 1, x: 0, y: 0 };

const round = (n: number): number => Math.round(n * 1e6) / 1e6;

/** One scroll at point `p` (frame pixels): up zooms in, down zooms out, clamped. */
export function zoomAt(v: ZoomView, p: { x: number; y: number }, deltaY: number): ZoomView {
  if (deltaY === 0) return v;
  const wanted = deltaY < 0 ? v.scale * ZOOM_VIEW_STEP : v.scale / ZOOM_VIEW_STEP;
  const scale = Math.min(ZOOM_VIEW_MAX, Math.max(ZOOM_VIEW_MIN, Math.abs(wanted - 1) < 1e-6 ? 1 : round(wanted)));
  const k = scale / v.scale;
  return { scale, x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k };
}

/** The CSS transform for the artwork (its origin is the frame's top-left corner). */
export function zoomTransform(v: ZoomView): string {
  return `translate(${v.x}px, ${v.y}px) scale(${v.scale})`;
}

export const isZoomed = (v: ZoomView): boolean => v.scale !== 1 || v.x !== 0 || v.y !== 0;

/** A middle-button drag: the artwork moves with the pointer, its scale kept. */
export function panBy(v: ZoomView, dx: number, dy: number): ZoomView {
  return dx === 0 && dy === 0 ? v : { ...v, x: v.x + dx, y: v.y + dy };
}
