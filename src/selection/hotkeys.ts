// hotkeys.ts — one owner for the review hotkeys (RULE 10), shared by both
// Selection surfaces: A approve, D decline, ↑/↓ move the active row, Space
// toggles the comparison zoom. Kept free of React so the mapping is testable.

import { type HotAction } from "../lib/reviewmeta";

export interface HotTarget {
  selectedId: string | null;
  visible: readonly { pairId: string }[];
  zoom: "fit" | "full";
  move?: (dir: 1 | -1) => void; // hook-level nav, honours the wrap setting
  decide: (id: string, d: "approved" | "declined") => void;
  select: (id: string) => void;
  patch: (p: { zoom?: "fit" | "full" }) => void;
}

/** The slice of the Selection API a hotkey is allowed to read. */
export interface HotSource {
  s: { selectedId: string | null; zoom: "fit" | "full" };
  visible: readonly { pairId: string }[];
  move?: (dir: 1 | -1) => void;
  decide: (id: string, d: "approved" | "declined") => void;
  select: (id: string) => void;
  patch: (p: { zoom?: "fit" | "full" }) => void;
}

export interface TimelineTarget {
  undo: () => void;
  redo: () => void;
}

/** Narrows the hook API to what a hotkey may touch. */
export function hotTarget(api: HotSource): HotTarget {
  return {
    selectedId: api.s.selectedId,
    visible: api.visible,
    zoom: api.s.zoom,
    move: api.move,
    decide: api.decide,
    select: api.select,
    patch: api.patch,
  };
}

export function runHotAction(act: HotAction, t: HotTarget): void {
  const id = t.selectedId;
  if (act === "approve" && id) return t.decide(id, "approved");
  if (act === "decline" && id) return t.decide(id, "declined");
  if (act === "zoom") return t.patch({ zoom: t.zoom === "fit" ? "full" : "fit" });
  navigate(act, t);
}

/** Next/prev: the hook-level mover when present (honours the wrap setting),
 * else a plain one-step walk over the visible list. */
function navigate(act: HotAction, t: HotTarget): void {
  if (t.move) return t.move(act === "next" ? 1 : -1);
  const next = neighbour(t.visible, t.selectedId, act === "next" ? 1 : -1);
  if (next) t.select(next.pairId);
}

function neighbour(
  visible: readonly { pairId: string }[], id: string | null, step: number,
): { pairId: string } | undefined {
  return visible[visible.findIndex((p) => p.pairId === id) + step];
}

/** True when the keystroke belongs to a text field, not to review (a11y §14). */
export function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLSelectElement
    || target instanceof HTMLTextAreaElement;
}

/** Ctrl/Cmd chords shared by both surfaces: Ctrl+K focuses the search field;
 * Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y walk the ONE global undo/redo timeline
 * (RULE 12), inert inside form fields where the browser owns the chord. */
export function ctrlChord(e: KeyboardEvent, timeline: TimelineTarget, searchSel: string): boolean {
  if (!(e.ctrlKey || e.metaKey)) return false;
  const k = e.key.toLowerCase();
  if (k === "k") {
    const el = document.querySelector(searchSel) as HTMLInputElement | null;
    if (!el) return false; // no search field on this surface: leave Ctrl+K alone
    e.preventDefault();
    el.focus();
    return true;
  }
  if (isTextField(e.target)) return false;
  if (k === "z") { e.preventDefault(); if (e.shiftKey) timeline.redo(); else timeline.undo(); return true; }
  if (k === "y") { e.preventDefault(); timeline.redo(); return true; }
  return false;
}
