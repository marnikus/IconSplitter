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

const KEY_MAP: Record<string, HotAction> = {
  a: "approve", A: "approve",
  d: "decline", D: "decline",
  ArrowDown: "next", s: "next", S: "next",
  ArrowUp: "prev", w: "prev", W: "prev",
  " ": "zoom",
};

/** Maps a raw KeyboardEvent.key to a review action; null = not a review key. */
export function keyToAction(key: string, inField: boolean): HotAction | null {
  if (inField) return null;
  return KEY_MAP[key] ?? null;
}
