// copypath.ts — the honest "Open in File Explorer" fallback (RULE 9), shared by
// every tab: a browser cannot launch Explorer, so the action copies the FOLDER
// path and says exactly that instead of failing silently. The base is the path
// proven for the folder the tab is showing — resolved from its handle, so a copy
// can never name a different folder that happens to share the name (I-63/D7) —
// and the text itself comes from lib/rootpath, so the Batch, Selection, Generate
// SVG and SVG-to-upload copies cannot drift apart.

import { folderCopyText } from "./rootpath";
import { pathFor, type FolderRef } from "./pathmemory";

export async function copyFolderText(
  folder: FolderRef, relPath: string, say: (msg: string, err?: boolean) => void,
): Promise<void> {
  const base = (await pathFor(folder.handle)).path || folder.name; // proven, else the name (I-46)
  const text = folderCopyText(base, relPath);
  try {
    await navigator.clipboard.writeText(text);
    say(`Folder path copied — browsers can't open Explorer directly: ${text}`);
  } catch {
    say("Could not copy the path", true);
  }
}
