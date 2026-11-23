// actions/merges.ts — big icons over 2 × 2 cells (2026-11-23, lib/svgBuilder/merges.ts).
// ⊞ in an icon's quick toolbar marks its cell (marks are working state, not
// undone); the fourth mark of a 2 × 2 square combines the four into ONE big
// icon — the first marked cell's — as one undo step of the look. ✕ on a big
// icon breaks it back into four cells (one undo step): the icons that were in
// the three hidden cells come back, a missing one is refilled from the recipe.
import { activeMerges, mergeFromMarks, toSlots, visiblePositions, type ActiveMerge } from "../../lib/svgBuilder/merges";
import { refillOne } from "../../lib/svgBuilder/selection";
import { isEmptySlot, padEmpty } from "../../lib/svgBuilder/slots";
import type { SheetConfig } from "../../lib/svgBuilder/types";
import { getAppState } from "../../state/appstore";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";
import { commitConfig, prefs } from "./config";
import { pickOf } from "./selection";

type Grid = SheetConfig["grid"];

export function mergeActions(get: () => BuilderActionContext): Pick<BuilderActions, "markMergeCell" | "breakMerge" | "setMergeStroke"> {
  return {
    markMergeCell: (slot) => markMergeCell(get(), slot),
    breakMerge: (slot) => breakMerge(get(), slot),
    setMergeStroke: (slot, width) => setMergeStroke(get(), slot, width),
  };
}

function withMerges(ctx: BuilderActionContext, merges: Grid["merges"], label: string, gesture = false): Grid {
  const grid = { ...ctx.model.config.grid, merges };
  commitConfig(ctx, { config: { ...ctx.model.config, grid }, label, gesture });
  prefs(ctx, { layout: "custom" });
  return grid;
}

/** The big icon drawn in slot `slot`, or null. */
function bigAt(ctx: BuilderActionContext, slot: number): ActiveMerge | null {
  const cell = ctx.layout.cells[slot];
  if (cell?.span !== 2) return null;
  return activeMerges(ctx.model.config.grid).find((m) => m.source === (cell.pos ?? cell.index)) ?? null;
}

function markHint(count: number): string {
  if (count === 0) return "Mark removed";
  if (count < 4) return `Cell marked (${count} / 4) — mark 4 cells that form a 2 × 2 square to combine them into one big icon`;
  return "These 4 cells are not a 2 × 2 square — ⊞ again unmarks a cell";
}

function markMergeCell(ctx: BuilderActionContext, slot: number): void {
  const cell = ctx.layout.cells[slot];
  const grid = ctx.model.config.grid;
  if (cell === undefined || cell.span === 2) return;
  if (grid.columns < 2 || grid.rows < 2) return ctx.say("Big icons need a grid of at least 2 × 2", true);
  const plain = new Set(ctx.layout.cells.filter((c) => c.span === undefined).map((c) => c.pos ?? c.index));
  const pos = cell.pos ?? cell.index;
  const kept = ctx.model.mergeMarks.filter((p) => plain.has(p)); // marks a later change hid or moved are dropped
  const marks = kept.includes(pos) ? kept.filter((p) => p !== pos) : [...kept, pos].slice(-4);
  const merge = mergeFromMarks(marks, grid);
  ctx.dispatch({ mergeMarks: merge === null ? marks : [] });
  if (merge === null) return ctx.say(markHint(marks.length));
  withMerges(ctx, [...grid.merges, merge], "Combine 4 cells into one big icon");
  ctx.say("4 cells combined into one big icon — ✕ on it breaks it back into 4");
}

function breakMerge(ctx: BuilderActionContext, slot: number): void {
  const big = bigAt(ctx, slot);
  if (big === null) return;
  const grid = withMerges(ctx, ctx.model.config.grid.merges.filter((_, i) => i !== big.at), "Break the big icon into 4 cells");
  refillRevealed(ctx, grid, big.cells);
  ctx.say("Big icon broken back into 4 cells");
}

/** The revealed cells that hold no icon (theirs went elsewhere meanwhile) get one from the recipe — quietly: the break is the step. */
function refillRevealed(ctx: BuilderActionContext, grid: Grid, cells: readonly number[]): void {
  const visible = visiblePositions(grid);
  let slots = [...toSlots(getAppState().builder.checked, grid)];
  let changed = false;
  for (const pos of cells) {
    const k = visible.indexOf(pos);
    if (k < 0 || (slots[k] !== undefined && !isEmptySlot(slots[k]))) continue;
    const next = refillOne({ ...pickOf(ctx, ctx.model.recipe, ctx.model.seed + k), current: slots });
    if (next === null) continue;
    slots = padEmpty(slots, k + 1);
    slots[k] = next;
    changed = true;
  }
  if (changed) ctx.setCheckedQuiet(slots);
}

function setMergeStroke(ctx: BuilderActionContext, slot: number, width: number): void {
  const big = bigAt(ctx, slot);
  if (big === null) return;
  const merges = ctx.model.config.grid.merges.map((m, i) => (i === big.at ? { ...m, strokeWidth: width } : m));
  withMerges(ctx, merges, "Big icon stroke", true);
}
