// usetailcut.ts — the tail cutter's slice of the Generate SVG actions
// (2026-11-06): "Cut tails" on the checked rows and "Approve cuts" for the
// checked rows that were reviewed; the rows' own Approve uses the same context.

import { useMemo } from "react";
import type { DirHandleLike } from "../../lib/fs";
import type { SvgCtx } from "../actions";
import { previewTargetOf } from "../rowmodel";
import { cutItemsOf, useTailCutter, type CutCtx } from "./cutactions";

export function useTailCutActions(ctx: SvgCtx): { cutTails: () => void; approveCuts: () => void } {
  const cut: CutCtx = useMemo(() => ({
    items: cutItemsOf(ctx.rows, (r: SvgCtx["rows"][number]) => previewTargetOf(r)?.svgPath ?? ""),
    rootRef: ctx.refs.root as { current: DirHandleLike | null },
    say: ctx.say,
  }), [ctx.rows, ctx.refs.root, ctx.say]);
  const api = useTailCutter(cut, ctx.checked);
  return useMemo(() => ({ cutTails: api.run, approveCuts: api.approve }), [api]);
}
