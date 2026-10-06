// copypath.ts — the honest "Open in File Explorer" fallback (RULE 9), shared by
// every tab: a browser cannot launch Explorer, so the action copies the FOLDER
// path and says exactly that instead of failing silently. The text comes from
// lib/rootpath, so the Batch, Selection and Generate SVG copies cannot drift
// apart (they used to: one wrote a file path with forward slashes).

import { folderCopyText } from "./rootpath";

export async function copyFolderText(
  rootName: string, relPath: string, say: (msg: string, err?: boolean) => void,
): Promise<void> {
  const text = folderCopyText(rootName, relPath);
  try {
    await navigator.clipboard.writeText(text);
    say(`Folder path copied — browsers can't open Explorer directly: ${text}`);
  } catch {
    say("Could not copy the path", true);
  }
}
