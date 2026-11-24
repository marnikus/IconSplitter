// padsides.ts — the icon area's padding per side (2026-11-24). A sheet keeps
// ONE `padding` until a single side is dragged; from then on `padSides` holds
// all four. Presets and older templates (no sides) pad every side alike, and
// four equal sides fold back into the one value (config.ts parse).
import { RANGES, clampTo } from "./ranges";
import type { SheetConfig } from "./types";

export type PadSide = "top" | "right" | "bottom" | "left";
export interface PadSides { top: number; right: number; bottom: number; left: number }
type Artboard = SheetConfig["artboard"];

export const PAD_SIDES: readonly PadSide[] = ["top", "right", "bottom", "left"];

/** Each side's padding in artboard px. */
export function padOf(a: Pick<Artboard, "padding" | "padSides">): PadSides {
  const p = a.padding;
  return a.padSides ?? { top: p, right: p, bottom: p, left: p };
}

/** One side set (the others keep theirs), or — `all` (Shift) — every side to that value. */
export function withPadSide(a: Artboard, side: PadSide, value: number, all: boolean): Artboard {
  const v = Math.round(clampTo(RANGES.padding, value));
  if (all) return { ...a, padding: v, padSides: null };
  return foldPad({ ...a, padSides: { ...padOf(a), [side]: v } });
}

/** Four equal sides are one padding again (no sides stored). */
export function foldPad(a: Artboard): Artboard {
  const s = a.padSides;
  if (s === null || !(s.top === s.right && s.right === s.bottom && s.bottom === s.left)) return a;
  return { ...a, padding: s.top, padSides: null };
}

/** Stored sides, clamped; anything else → no sides. */
export function parsePadSides(raw: unknown, fallback: number): PadSides | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const side = (k: PadSide) => {
    const n = typeof r[k] === "number" && Number.isFinite(r[k]) ? (r[k] as number) : fallback;
    return Math.round(clampTo(RANGES.padding, n));
  };
  return { top: side("top"), right: side("right"), bottom: side("bottom"), left: side("left") };
}
