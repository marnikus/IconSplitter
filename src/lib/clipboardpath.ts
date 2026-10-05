// clipboardpath.ts — the picked folder's real path, taken from the clipboard.
// The File System Access API never tells a page where the folder it picked
// lives (only its name), so the one place the real path exists is what the user
// copied in Explorer — "Copy as path" (Ctrl+Shift+C) puts it on the clipboard.
// This module reads that, matches it against the folder that was really picked
// (lib/rootpath.pathFromCopied), remembers it, and never invents one (I-35). It
// holds no UI: ui/pickroot and ui/rootcapture are the callers, and ui/FolderBar
// shows the result (I-45).
//
// The read answers with a STATE, not just text (I-52): "nothing was copied" and
// "the browser blocked the read" need different words on screen and a different
// way out for the user (Rescan vs. a paste), so the caller can no longer see
// both of them as one empty string.

import { pathFromCopied, saveRootPathInfo, type RootPathInfo } from "./rootpath";

/** What the clipboard read produced — why it is empty, when it is. */
export type ClipState = "text" | "empty" | "blocked" | "unsupported";

export interface ClipRead {
  text: string;
  state: ClipState;
}

/** Reads the clipboard; never throws, always says what happened (I-52). */
export async function readClipboardText(): Promise<ClipRead> {
  const clip = navigator.clipboard as Clipboard | undefined;
  if (!clip || typeof clip.readText !== "function") return { text: "", state: "unsupported" };
  try {
    const text = await clip.readText();
    return text === "" ? { text: "", state: "empty" } : { text, state: "text" };
  } catch {
    return { text: "", state: "blocked" }; // permission denied, or an unfocused window
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
