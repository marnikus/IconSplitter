// actions/sheetsroot.ts — where _artboard_sheets lives (2026-11-16): BESIDE
// _split_output, never inside it. With `_split_output` itself open the browser
// cannot reach its parent from that handle, so the parent is found among the
// folders this app already holds (Batch, the other tabs) — the one whose
// `_split_output` IS the open folder — or, on 📂 Location, picked once by the
// user. It is remembered; until it is known nothing is written.
import { OUTPUT_DIR } from "../../lib/batchlayout";
import type { DirHandleLike } from "../../lib/fs";
import { boundRootPathInfo, rememberKnownRoot } from "../../lib/knownroots";
import { idbGetAll, loadHandles, saveHandles, type StoredHandles } from "../../batch/store";
import { ensurePermission, pickDirectory } from "../../batch/picker";
import type { BuilderActionContext } from "../actiontypes";

export const SHEETS_BESIDE_SPLIT = `Open the folder that holds ${OUTPUT_DIR} — _artboard_sheets is saved beside it, never inside it`;
const PARENT_KEY = "__svgBuilderSheets__";

let known: { root: DirHandleLike; parent: DirHandleLike } | null = null;

/** True when the open folder is a split-output folder itself. */
export const isSplitOutput = (root: DirHandleLike | null): boolean => root !== null && root.name === OUTPUT_DIR;

/** Forgets the found parent (tests, a new folder). */
export function forgetSheetsParent(): void { known = null; }

/** The folder sheets are written into, or null (no folder, or _split_output open without its parent — then the user is told). */
export function sheetsRoot(ctx: BuilderActionContext, quiet = false): DirHandleLike | null {
  const root = ctx.model.root;
  if (!isSplitOutput(root)) return root;
  if (known !== null && known.root === root) return known.parent;
  if (!quiet) ctx.say(SHEETS_BESIDE_SPLIT, true);
  return null;
}

/** The full path of the sheets folder's root ("" when unknown): the parent of `…\_split_output` when that is open. */
export function sheetsRootPath(ctx: BuilderActionContext): string {
  const path = boundRootPathInfo(ctx.model.root).path;
  return isSplitOutput(ctx.model.root) ? path.replace(/[\\/]+[^\\/]+[\\/]*$/, "") : path;
}

/** Is `candidate` the folder that holds `root` as its `_split_output`? */
async function holds(candidate: DirHandleLike, root: DirHandleLike): Promise<boolean> {
  try {
    const child = await candidate.getDirectoryHandle(OUTPUT_DIR);
    return child === root || (await child.isSameEntry?.(root)) === true;
  } catch { return false; }
}

function adopt(root: DirHandleLike, parent: DirHandleLike): void {
  known = { root, parent };
  const path = boundRootPathInfo(root).path;
  if (path !== "" && boundRootPathInfo(parent).path === "") rememberKnownRoot(parent, path.replace(/[\\/]+[^\\/]+[\\/]*$/, ""));
}

/** At scan time: the parent among the folders already held (no prompt). True when found. */
export async function findSheetsParent(root: DirHandleLike): Promise<boolean> {
  if (known?.root === root) return true;
  const own = (await loadHandles(PARENT_KEY))?.source;
  const all = await idbGetAll<StoredHandles>("handles").catch(() => [] as StoredHandles[]);
  const candidates = [own, ...all.flatMap((h) => [h?.source, h?.dest])].filter((h): h is DirHandleLike => h != null && h !== root);
  for (const c of candidates) {
    if (await holds(c, root)) { adopt(root, c); await saveHandles(PARENT_KEY, { source: c }).catch(() => undefined); return true; }
  }
  return false;
}

/** On a click: the parent is found, granted, or picked once by the user. True when sheets can be written. */
export async function ensureSheetsParent(ctx: BuilderActionContext): Promise<boolean> {
  const root = ctx.model.root;
  if (!isSplitOutput(root) || root === null) return root !== null;
  if (known?.root === root || await findSheetsParent(root)) return ensurePermission(known!.parent);
  ctx.say(`Pick the folder that holds ${OUTPUT_DIR} — _artboard_sheets is saved there`);
  const picked = await pickDirectory();
  if (picked === null) return false;
  if (!(await holds(picked, root))) { ctx.say(`That folder has no ${OUTPUT_DIR} matching the open one`, true); return false; }
  adopt(root, picked);
  await saveHandles(PARENT_KEY, { source: picked }).catch(() => undefined);
  return true;
}
