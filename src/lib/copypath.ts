// copypath.ts — the honest "Open in File Explorer" fallback (RULE 9), shared by
// every tab: a browser cannot launch Explorer, so the action copies the FOLDER
// path and says exactly that instead of failing silently. The text comes from
// the root HANDLE's own binding (lib/rootpath rules, I-63), so the Batch,
// Selection, Generate SVG and Upload copies cannot drift apart and can never
// carry a same-named folder's path (the third report, 2026-10-09).

import type { DirHandleLike } from "./fs";
import { boundRootPathInfo } from "./knownroots";
import { folderCopyText } from "./rootpath";

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
