// copypath.ts — the honest "Open in File Explorer" fallback (RULE 9), shared by
// every tab: a browser cannot launch Explorer, so the action copies the FOLDER
// path and says exactly that instead of failing silently. The text comes from
// the root HANDLE's own binding (lib/rootpath rules, I-63), so the Batch,
// Selection, Generate SVG and Upload copies cannot drift apart and can never
// carry a same-named folder's path (the third report, 2026-10-09).

import type { DirHandleLike } from "./fs";
import { OUTPUT_DIR } from "./batchlayout";
import { boundRootPathInfo } from "./knownroots";
import { folderCopyText, normalizeRootPath } from "./rootpath";

export async function copyFolderText(
  handle: DirHandleLike | null, relPath: string, say: (msg: string, err?: boolean) => void,
): Promise<void> {
  const text = folderCopyText(baseOf(handle), relPath);
  try {
    await navigator.clipboard.writeText(text);
    say(`Folder path copied — browsers can't open Explorer directly: ${text}`);
  } catch {
    say("Could not copy the path", true);
  }
}

/** The copy's base: this folder's captured path, else its name (I-29). */
function baseOf(handle: DirHandleLike | null): string {
  return handle === null ? "" : boundRootPathInfo(handle).path || handle.name;
}

/** The split output folder's copyable base (I-29 honesty): a custom dest's own
 *  bound path, else its name — except the auto dest, which is the app's own
 *  `_split_output` under the root, so the root's base is what carries the path. */
export function splitOutputBase(dest: DirHandleLike | null, root: DirHandleLike | null): string {
  if (dest !== null && dest.name !== OUTPUT_DIR) return baseOf(dest) || dest.name;
  const rootBase = root === null ? "" : baseOf(root) || root.name; // unbound root: its own name is the honest base (I-29)
  return rootBase === "" ? OUTPUT_DIR : `${rootBase}\\${OUTPUT_DIR}`;
}

/** The processed-row "Location" action: copies the folder holding the item's
 *  splits (`outRel`, relative to dest) and says exactly that (RULE 9). */
export async function copySplitFolderText(
  dest: DirHandleLike | null, root: DirHandleLike | null, outRel: string, say: (msg: string, err?: boolean) => void,
): Promise<void> {
  // outRel is already a FOLDER (not a file), so this is a plain join — folderCopyText would wrongly drop its last segment (I-56).
  const text = normalizeRootPath(`${splitOutputBase(dest, root)}/${outRel}`);
  try {
    await navigator.clipboard.writeText(text);
    say(`Split folder copied — browsers can't open Explorer directly: ${text}`);
  } catch {
    say("Could not copy the path", true);
  }
}
