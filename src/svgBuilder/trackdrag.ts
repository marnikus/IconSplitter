// trackdrag.ts — one pointer drag on the scaled artboard (2026-11-14): reports
// the movement in artboard pixels (screen px ÷ zoom) until the pointer is up.
import type { PointerEvent as ReactPointerEvent } from "react";

/** `shift`: Shift is held at this moment of the drag (2026-11-24: a padding grip then sets every side). */
export interface Delta { dx: number; dy: number; shift?: boolean }

export function trackDrag(e: ReactPointerEvent, zoom: number, move: (d: Delta) => void, end: () => void): void {
  e.preventDefault();
  e.stopPropagation();
  const from = { x: e.clientX, y: e.clientY };
  const z = zoom > 0 ? zoom : 1;
  const onMove = (ev: PointerEvent) => move({ dx: (ev.clientX - from.x) / z, dy: (ev.clientY - from.y) / z, shift: ev.shiftKey });
  const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); end(); };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

/** A fresh history gesture id: everything one drag commits is one undo step. */
export const dragGesture = (name: string) => `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
