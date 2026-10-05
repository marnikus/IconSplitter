// clipboardpath.ts — the picked folder's real path, taken from the clipboard.
// The File System Access API never tells a page where the folder it picked
// lives (only its name), so the one place the real path exists is what the user
// copied in Explorer — "Copy as path" (Ctrl+Shift+C) puts it on the clipboard.
// This module reads that, matches it against the folder that was really picked
// (lib/rootpath.pathFromCopied), remembers it, and never invents one (I-35). It
// holds no UI: the picker (ui/pickroot) is the only caller, and ui/FolderBar
// shows the result (I-45).

import { pathFromCopied, saveRootPathInfo, type RootPathInfo } from "./rootpath";

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
 * Remembers the path of the folder the user picked, from text the caller already
 * has (the pre-dialog read). Returns what the memory now holds — `{ "", null }`
 * when the clipboard named nothing usable, which is no error: the user's real
 * goal (scanning the folder) never depends on the capture.
 */
export function adoptCopiedText(folderName: string, copied: string): RootPathInfo {
  const info = pathFromCopied(copied, folderName);
  if (info.path === "") return { path: "", how: null };
  return saveRootPathInfo(folderName, info.path, info.how ?? "copied");
}
