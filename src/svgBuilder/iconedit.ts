// iconedit.ts — editing an icon right from the artboard (2026-11-15) with the
// Generate SVG tab's editor. Finish writes the icon's SVG in the builder's own
// folder (Generate SVG's writer, `writeSvgMarkup`) as ONE undo step of type
// `builderSvgEdit`; undo / redo write the other side back. The mounted builder
// lends its folder and redraws the sheet with the new text (`written`).
import type { DirHandleLike } from "../lib/fs";
import type { NewEntry } from "../state/HistoryProvider";
import { getAppState } from "../state/appstore";
import { writeSvgMarkup } from "../svg/svgedit";

export interface IconEditSide { svgPath: string; markup: string }
interface Binding { root: () => DirHandleLike | null; written: (svgPath: string, markup: string) => void }

let live: Binding | null = null;

export function bindBuilderSvgEdit(b: Binding): () => void {
  live = b;
  return () => { if (live === b) live = null; };
}

export interface SaveIconEditArgs {
  id: string; svgPath: string; label: string; before: string; after: string;
  push: (entry: NewEntry) => void;
}

/** Finish: one write, one history entry; false (nothing recorded) when unchanged or not written. */
export async function saveIconEdit(a: SaveIconEditArgs): Promise<boolean> {
  const b = live;
  const root = b?.root() ?? null;
  if (b === null || root === null || a.before === a.after) return false;
  try { await writeSvgMarkup(root, a.svgPath, a.after); } catch { return false; }
  b.written(a.svgPath, a.after);
  a.push({ type: "builderSvgEdit", label: `Edit icon ${a.label}`, origin: getAppState().tab, ids: [a.id],
    before: { svgPath: a.svgPath, markup: a.before }, after: { svgPath: a.svgPath, markup: a.after } });
  return true;
}

function sideOf(value: unknown): IconEditSide | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  return typeof v.svgPath === "string" && typeof v.markup === "string" ? { svgPath: v.svgPath, markup: v.markup } : null;
}

/** Undo / redo: write that side's text back; false when it cannot be written. */
export async function applyBuilderSvgEdit(value: unknown): Promise<boolean> {
  const side = sideOf(value);
  const b = live;
  const root = b?.root() ?? null;
  if (side === null || b === null || root === null) return false;
  try { await writeSvgMarkup(root, side.svgPath, side.markup); } catch { return false; }
  b.written(side.svgPath, side.markup);
  return true;
}
