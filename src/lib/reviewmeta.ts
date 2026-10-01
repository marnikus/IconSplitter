// reviewmeta.ts — tiny presentational semantics for Selection (a11y §11).
// Statuses always carry a text label plus a glyph so state never relies on
// colour alone; hotkey mapping is pure so keyboard support is unit-tested.

import type { Decision } from "./reviewfilter";

export interface StatusMeta {
  label: "Pending" | "Approved" | "Declined";
  glyph: string;
  tone: "neutral" | "ok" | "bad";
}

export function statusInfo(d: Decision): StatusMeta {
  if (d === "approved") return { label: "Approved", glyph: "✓", tone: "ok" };
  if (d === "declined") return { label: "Declined", glyph: "✕", tone: "bad" };
  return { label: "Pending", glyph: "◔", tone: "neutral" };
}

export type HotAction = "approve" | "decline" | "next" | "prev" | "zoom";

/** Maps a raw KeyboardEvent.key to a review action; null = not a review key. */
export function keyToAction(key: string, inField: boolean): HotAction | null {
  if (inField) return null;
  switch (key) {
    case "a": case "A": return "approve";
    case "d": case "D": return "decline";
    case "ArrowDown": return "next";
    case "ArrowUp": return "prev";
    case " ": return "zoom";
    default: return null;
  }
}
