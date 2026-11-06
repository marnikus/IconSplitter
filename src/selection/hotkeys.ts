// hotkeys.ts — one owner for the review hotkeys (RULE 10), shared by both
// Selection surfaces: A approve, D decline, ↑/↓ move the active row, Space
// toggles the comparison zoom. Kept free of React so the mapping is testable.

import { type HotAction } from "../lib/reviewmeta";
import { nextVisibleId } from "../lib/reviewselect";

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
  if (act === "approve") { if (id) t.decide(id, "approved"); return; }
  if (act === "decline") { if (id) t.decide(id, "declined"); return; }
  if (act === "zoom") return t.patch({ zoom: t.zoom === "fit" ? "full" : "fit" });
  const next = nextVisibleId(t.visible.map((p) => p.pairId), id, act === "next" ? 1 : -1);
  if (next && next !== id) t.select(next);
}

/** Input types that hold text the user is composing — everything else is a control. */
const TEXT_TYPES = new Set([
  "text", "search", "number", "email", "password", "url", "tel", "date", "month", "time", "datetime-local",
]);

/**
 * True when the keystroke belongs to text entry, not to review (a11y §14).
 *
 * Only text surfaces count: a slider, checkbox or button keeps focus after use,
 * and swallowing Ctrl+Z there made undo look broken right after the two controls
 * people reach for most — the zoom slider and the row checkboxes.
 */
export function isTextField(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return TEXT_TYPES.has(target.type.toLowerCase());
  return target instanceof HTMLElement && target.isContentEditable;
}
