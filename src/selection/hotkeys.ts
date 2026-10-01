// hotkeys.ts — one owner for the review hotkeys (RULE 10), shared by both
// Selection surfaces: A approve, D decline, ↑/↓ move the active row, Space
// toggles the comparison zoom. Kept free of React so the mapping is testable.

import { type HotAction } from "../lib/reviewmeta";

export interface HotTarget {
  selectedId: string | null;
  visible: readonly { pairId: string }[];
  zoom: "fit" | "full";
  decide: (id: string, d: "approved" | "declined") => void;
  select: (id: string) => void;
  patch: (p: { zoom?: "fit" | "full" }) => void;
}

/** The slice of the Selection API a hotkey is allowed to read. */
export interface HotSource {
  s: { selectedId: string | null; zoom: "fit" | "full" };
  visible: readonly { pairId: string }[];
  decide: (id: string, d: "approved" | "declined") => void;
  select: (id: string) => void;
  patch: (p: { zoom?: "fit" | "full" }) => void;
}

/** Narrows the hook API to what a hotkey may touch. */
export function hotTarget(api: HotSource): HotTarget {
  return {
    selectedId: api.s.selectedId,
    visible: api.visible,
    zoom: api.s.zoom,
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
  const next = neighbour(t.visible, id, act === "next" ? 1 : -1);
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
