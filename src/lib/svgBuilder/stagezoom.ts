// stagezoom.ts — the SVG builder stage's Figma-style zoom math (2026-11-24).
// Ctrl/⌘ + wheel zooms smoothly by a factor of the wheel delta; Ctrl + Shift +
// wheel steps along round percentages; the artboard point under the cursor is
// kept under it by re-scrolling the canvas. Pure: the hook owns the DOM.

export const STAGE_ZOOM_MIN = 0.1;
export const STAGE_ZOOM_MAX = 8;
/** The round percentages Ctrl + Shift + wheel steps through. */
export const STAGE_ZOOM_STEPS: readonly number[] = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];

/** One mouse-wheel notch (100 px) changes the zoom by about 22 %. */
const WHEEL_RATE = 0.002;
/** A line-mode wheel (deltaMode 1) scrolls about 16 px per line. */
const LINE_PX = 16;

/** Clamps into 10–800 %, kept to 0.001 so a trackpad's small steps never stall; garbage → 100 %. */
export function clampStageZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(STAGE_ZOOM_MAX, Math.max(STAGE_ZOOM_MIN, Math.round(zoom * 1000) / 1000));
}

/** The wheel's travel in px: Shift moves it into deltaX on Windows; line mode is scaled to px. */
export function wheelDelta(e: { deltaX: number; deltaY: number; deltaMode: number }): number {
  const raw = e.deltaY !== 0 ? e.deltaY : e.deltaX;
  return e.deltaMode === 1 ? raw * LINE_PX : raw;
}

/** Ctrl + wheel: negative delta (wheel up) zooms in, by a factor symmetric both ways. */
export function smoothZoom(zoom: number, delta: number): number {
  const next = clampStageZoom(zoom * Math.exp(-delta * WHEEL_RATE));
  if (next !== zoom || delta === 0) return next;
  return clampStageZoom(zoom + (delta < 0 ? 0.001 : -0.001));
}

/** Ctrl + Shift + wheel: the next round percentage in the wheel's direction (negative = in). */
export function snapZoom(zoom: number, direction: number): number {
  const eps = 1e-6;
  const next = direction < 0
    ? STAGE_ZOOM_STEPS.find((s) => s > zoom + eps)
    : [...STAGE_ZOOM_STEPS].reverse().find((s) => s < zoom - eps);
  return next ?? (direction < 0 ? STAGE_ZOOM_MAX : STAGE_ZOOM_MIN);
}

/** One axis of the re-scroll after a zoom: `edge` is the artboard's new screen edge, `point` the artboard px that was under `cursor`. */
export interface ScrollAnchor { scroll: number; cursor: number; edge: number; point: number; zoom: number }

/** The scroll offset that puts `point` back under the cursor. */
export function anchoredScroll({ scroll, cursor, edge, point, zoom }: ScrollAnchor): number {
  return scroll + edge - (cursor - point * zoom);
}
