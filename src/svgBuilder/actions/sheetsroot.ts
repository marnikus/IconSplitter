// actions/sheetsroot.ts — where _artboard_sheets lives (2026-11-16): BESIDE
// _split_output, never inside it. With `_split_output` itself open the browser
// cannot reach its parent, so nothing is written and the user is asked to open
// the folder that holds it (its scan still finds every approved SVG inside).
import { OUTPUT_DIR } from "../../lib/batchlayout";
import type { DirHandleLike } from "../../lib/fs";
import type { BuilderActionContext } from "../actiontypes";

export const SHEETS_BESIDE_SPLIT = `Open the folder that holds ${OUTPUT_DIR} — _artboard_sheets is saved beside it, never inside it`;

/** True when the open folder is a split-output folder itself. */
export const isSplitOutput = (root: DirHandleLike | null): boolean => root !== null && root.name === OUTPUT_DIR;

/** The folder sheets are written into, or null (no folder, or _split_output open — then the user is told). */
export function sheetsRoot(ctx: BuilderActionContext, quiet = false): DirHandleLike | null {
  const root = ctx.model.root;
  if (!isSplitOutput(root)) return root;
  if (!quiet) ctx.say(SHEETS_BESIDE_SPLIT, true);
  return null;
}
