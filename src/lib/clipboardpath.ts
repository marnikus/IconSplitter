// clipboardpath.ts — the picked folder's real path, taken from the clipboard.
// The File System Access API never tells a page where the folder it picked
// lives (only its name), so the one place the real path exists is what the user
// copied in Explorer — "Copy as path" (Ctrl+Shift+C) puts it on the clipboard.
// This module reads that and hands the text to lib/rootpath, which matches it
// against the folder that was really picked and never completes or invents one
// (I-35). The capture is silent: the tab's own path row shows the result
// (design 2026-10-05-folder-ui).

import { pathFromCopied, saveRootPath } from "./rootpath";

/** The clipboard text; "" when it is empty, "none" when it cannot be read. */
export async function readCopiedText(): Promise<string> {
  const clip = navigator.clipboard as Clipboard | undefined;
  if (!clip || typeof clip.readText !== "function") return "none";
  try {
    return await clip.readText();
  } catch {
    return "none"; // permission denied, no user activation, or an unfocused window
  }
}

/**
 * Reads `copied` (already in hand from the pick's own read) and, when it names
 * `folderName` exactly, remembers it as that root's full path. Returns the
 * stored path, or "" when the clipboard held nothing usable — a refusal is
 * never an error here, because the user's real goal (scanning the folder) does
 * not depend on it.
 */
export function adoptCopiedText(folderName: string, copied: string): string {
  const path = pathFromCopied(copied, folderName);
  return path !== "" && saveRootPath(folderName, path) ? path : "";
}
