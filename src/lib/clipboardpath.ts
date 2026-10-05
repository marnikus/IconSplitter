// clipboardpath.ts — the picked folder's real path, taken from the clipboard.
// The File System Access API never tells a page where the folder it picked
// lives (only its name), so the one place the real path exists is what the user
// copied in Explorer — "Copy as path" (Ctrl+Shift+C) puts it on the clipboard.
// This module reads that, matches it against the folder that was really picked
// (lib/rootpath.pathFromCopied), remembers it, and never invents one (I-35).

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
 * Reads the clipboard and, if it names `folderName` (exactly, or as the parent
 * it lives in), remembers it as that root's full path. Returns the stored path,
 * or null when the clipboard held nothing usable — a refusal is never an error
 * here, because the user's real goal (scanning the folder) does not depend on it.
 */
export async function adoptCopiedPath(folderName: string): Promise<string | null> {
  const copied = await readCopiedText();
  if (copied === "" || copied === "none") return null;
  const info = pathFromCopied(copied, folderName);
  if (info.path === "") return null;
  return saveRootPathInfo(folderName, info.path, info.how ?? "pasted").path || null;
}

/** The same, starting from text the caller already has (a pre-dialog read). */
export function adoptCopiedText(folderName: string, copied: string): RootPathInfo {
  const info = pathFromCopied(copied, folderName);
  if (info.path === "") return { path: "", how: null };
  return saveRootPathInfo(folderName, info.path, info.how ?? "pasted");
}
